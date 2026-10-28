import { stat } from "node:fs/promises";
import { isAbsolute, win32 } from "node:path";
import { execFile, spawn } from "node:child_process";
import { statSync } from "node:fs";
import { shell } from "electron";
import type { OpenInEditorOptions, OpenInEditorRemoteTarget } from "@zcode/shared";
import { listWSLDistros } from "@zcode/server/remote/wsl-detect.js";
import { getEditorDefsForCurrentPlatform, resolveEditorDefAppPath } from "./editors.js";
import { logger } from "./logger.js";
import {
  getFileApplicationDefs,
  matchesFileApplication,
  resolveFileApplicationPath,
} from "@desktop/main/fileApplications.js";
import { isDelegatedWindowsExplorerExit } from "./windowsExplorerDelegation.js";

type PathKind = "file" | "directory" | "unknown";

interface OpenInEditorResult {
  success: boolean;
  error?: string;
}

const VSCODE_EDITOR_IDS = new Set(["vscode", "vscode-insiders"]);

// Cursor 是 VS Code fork，CLI 同样支持 `--goto path:line:column`。
const VSCODE_GOTO_EDITOR_IDS = new Set(["vscode", "vscode-insiders", "cursor"]);

// JetBrains 系 launcher 支持 `--line <line> [<column>] <path>`。
const JETBRAINS_LINE_EDITOR_IDS = new Set([
    "idea",
    "idea-ce",
    "webstorm",
    "pycharm",
    "goland",
    "phpstorm",
    "rider",
    "clion",
    "rubymine",
    "datagrip",
]);

function hasValidRevealPosition(options: OpenInEditorOptions | undefined): boolean {
    return Number.isInteger(options?.line) && (options?.line as number) > 0;
}

/**
 * 本地路径 + 行号定位的编辑器 CLI 参数。
 *
 * 聊天里的 `path:line` 文件链接此前只把路径交给编辑器，打开后还要手动找行。
 * 只有 CLI 明确支持定位参数的编辑器会带上行号；其余编辑器保持原样打开，
 * 避免把 `--goto`/`--line` 当作通用参数传给不认识的 launcher。
 */
function buildLocalEditorOpenArgs(
    editorId: string,
    path: string,
    options: OpenInEditorOptions | undefined,
): string[] {
    const line = options?.line;
    const column = options?.column;
    if (!hasValidRevealPosition(options)) {
        return [path];
    }

    if (VSCODE_GOTO_EDITOR_IDS.has(editorId)) {
        // Windows 盘符路径含 `C:`，VS Code CLI 对 `--goto` 会从右侧解析行/列，盘符不受影响。
        return ["--goto", column ? `${path}:${line}:${column}` : `${path}:${line}`];
    }

    if (JETBRAINS_LINE_EDITOR_IDS.has(editorId)) {
        return column
            ? ["--line", String(line), String(column), path]
            : ["--line", String(line), path];
    }

    return [path];
}

/**
 * macOS `open -a` 的参数：无定位参数时保持 `open -a App path`（LaunchServices 文档打开），
 * 只有带行号定位时才改走 `--args` 把 CLI 参数（如 `--goto path:line`）透传给应用。
 */
function buildMacOpenEditorArgs(appPath: string, openArgs: string[]): string[] {
    return openArgs.length > 1
        ? ["-a", appPath, "--args", ...openArgs]
        : ["-a", appPath, ...openArgs];
}

const stringifyError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const execFileAsync = (file: string, args: string[]): Promise<void> =>
  new Promise((resolve, reject) => {
    execFile(file, args, (error) => (error ? reject(error) : resolve()));
  });

async function openPathViaShell(path: string): Promise<OpenInEditorResult> {
  const error = await shell.openPath(path);
  return error ? { success: false, error } : { success: true };
}

function detectPathKind(path: string): PathKind {
  try {
    const stats = statSync(path);
    if (stats.isFile()) {
      return "file";
    }
    if (stats.isDirectory()) {
      return "directory";
    }
  } catch {
    // 非本地路径或路径不存在时保留 unknown，交给后续 fallback 处理。
  }
  return "unknown";
}

function isVSCodeEditor(editorId: string): boolean {
  return VSCODE_EDITOR_IDS.has(editorId);
}

function normalizeRemotePath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function encodeRemotePath(path: string): string {
  return normalizeRemotePath(path)
    .split("/")
    .map((segment, index) => (index === 0 ? "" : encodeURIComponent(segment)))
    .join("/");
}

async function resolveWslDistroName(
  target: Extract<OpenInEditorRemoteTarget, { kind: "wsl" }>,
): Promise<string | null> {
  const explicitDistro = target.distro?.trim();
  if (explicitDistro) {
    return explicitDistro;
  }

  try {
    const distros = await listWSLDistros();
    return distros.find((distro) => distro.isDefault)?.name ?? distros[0]?.name ?? null;
  } catch (error) {
    logger.warn("[editors] 解析默认 WSL distro 失败", {
      error: stringifyError(error),
    });
    return null;
  }
}

function buildWslUncPathCandidates(path: string, distroName: string): string[] {
  const normalizedPath = normalizeRemotePath(path);
  const suffix = normalizedPath
    .split("/")
    .filter((segment) => segment.length > 0)
    .join("\\");
  const pathSuffix = suffix ? `\\${suffix}` : "";

  return [`\\\\wsl.localhost\\${distroName}${pathSuffix}`, `\\\\wsl$\\${distroName}${pathSuffix}`];
}

function resolveVSCodeSshRemoteAuthority(
  target: Extract<OpenInEditorRemoteTarget, { kind: "ssh" }>,
): string {
  const sshConfigAlias = target.sshConfigAlias?.trim();
  if (sshConfigAlias) {
    return sshConfigAlias;
  }

  const username = target.username.trim();
  const host = target.host.trim();
  const userHost = username ? `${username}@${host}` : host;
  return target.port && target.port !== 22 ? `${userHost}:${target.port}` : userHost;
}

function buildVSCodeSshFolderUri(
  path: string,
  target: Extract<OpenInEditorRemoteTarget, { kind: "ssh" }>,
) {
  // 手填 SSH 目标没有 alias 时，authority 里可能包含 `@` 和 `:`。
  // 直接拼进 URI 会被解析成 userinfo/host/port，必须按 Remote-SSH authority 组件整体编码。
  const encodedAuthority = encodeURIComponent(resolveVSCodeSshRemoteAuthority(target));
  return `vscode-remote://ssh-remote+${encodedAuthority}${encodeRemotePath(path)}`;
}

async function buildVSCodeWslFolderUri(
  path: string,
  target: Extract<OpenInEditorRemoteTarget, { kind: "wsl" }>,
): Promise<{ uri?: string; error?: string }> {
  const distroName = await resolveWslDistroName(target);
  if (!distroName) {
    return { error: "missing WSL distro for VS Code Remote-WSL" };
  }

  return {
    uri: `vscode-remote://wsl+${encodeURIComponent(distroName)}${encodeRemotePath(path)}`,
  };
}

async function openVSCodeRemoteSshFolder(
  editorId: string,
  appPath: string,
  command: string | null,
  path: string,
  remoteTarget: Extract<OpenInEditorRemoteTarget, { kind: "ssh" }>,
  pathKind: OpenInEditorOptions["pathKind"],
): Promise<OpenInEditorResult> {
  // 远程文件和目录以前共用 folder URI，导致文件路径被 VS Code 当成目录；
  // pathKind 只决定 CLI URI 参数，远端路径与 workspace identity 保持原样。
  const args = [
    pathKind === "file" ? "--file-uri" : "--folder-uri",
    buildVSCodeSshFolderUri(path, remoteTarget),
  ];

  if (command) {
    try {
      await execFileAsync(command, args);
      return { success: true };
    } catch (error) {
      if (process.platform === "win32") {
        return openWindowsEditor(editorId, appPath, args, error);
      }

      try {
        await execFileAsync("open", ["-a", appPath, "--args", ...args]);
        return { success: true };
      } catch (fallbackError) {
        logger.warn("[editors] 打开 VS Code 远程工作区失败", {
          editorId,
          path,
          args,
          error: stringifyError(error),
          fallbackError: stringifyError(fallbackError),
        });
        return { success: false, error: stringifyError(fallbackError) };
      }
    }
  }

  try {
    if (process.platform === "win32") {
      await execFileAsync(appPath, args);
    } else {
      await execFileAsync("open", ["-a", appPath, "--args", ...args]);
    }
    return { success: true };
  } catch (error) {
    logger.warn("[editors] 打开 VS Code 远程工作区失败", {
      editorId,
      path,
      args,
      error: stringifyError(error),
    });
    return { success: false, error: stringifyError(error) };
  }
}

async function openVSCodeRemoteWslFolder(
  editorId: string,
  appPath: string,
  command: string | null,
  path: string,
  remoteTarget: Extract<OpenInEditorRemoteTarget, { kind: "wsl" }>,
  pathKind: OpenInEditorOptions["pathKind"],
): Promise<OpenInEditorResult> {
  const folderUri = await buildVSCodeWslFolderUri(path, remoteTarget);
  if (!folderUri.uri) {
        return {
            success: false,
            error: folderUri.error ?? "invalid WSL folder URI",
        };
  }

  const args = [pathKind === "file" ? "--file-uri" : "--folder-uri", folderUri.uri];

  if (command) {
    try {
      await execFileAsync(command, args);
      return { success: true };
    } catch (error) {
      if (process.platform === "win32") {
        return openWindowsEditor(editorId, appPath, args, error);
      }

      try {
        await execFileAsync("open", ["-a", appPath, "--args", ...args]);
        return { success: true };
      } catch (fallbackError) {
        logger.warn("[editors] 打开 VS Code WSL 工作区失败", {
          editorId,
          path,
          args,
          error: stringifyError(error),
          fallbackError: stringifyError(fallbackError),
        });
        return { success: false, error: stringifyError(fallbackError) };
      }
    }
  }

  try {
    if (process.platform === "win32") {
      await execFileAsync(appPath, args);
    } else {
      await execFileAsync("open", ["-a", appPath, "--args", ...args]);
    }
    return { success: true };
  } catch (error) {
    logger.warn("[editors] 打开 VS Code WSL 工作区失败", {
      editorId,
      path,
      args,
      error: stringifyError(error),
    });
    return { success: false, error: stringifyError(error) };
  }
}

async function openWslPathInExplorer(
  appPath: string,
  path: string,
  remoteTarget: Extract<OpenInEditorRemoteTarget, { kind: "wsl" }>,
  pathKind: OpenInEditorOptions["pathKind"],
): Promise<OpenInEditorResult> {
  const distroName = await resolveWslDistroName(remoteTarget);
  if (!distroName) {
    return { success: false, error: "missing WSL distro for Windows Explorer" };
  }

  const candidates = buildWslUncPathCandidates(path, distroName);
  let lastError = "";
  for (const candidate of candidates) {
    const args = pathKind === "file" ? ["/select,", candidate] : [candidate];
    try {
      await execFileAsync(appPath, args);
      return { success: true };
    } catch (error) {
      // explorer.exe 会把请求委托给已运行的资源管理器进程，窗口已经打开时
      // 子进程仍可能以 code=1 退出。不能只按数字退出码吞错；必须同时核对 Windows
      // 平台、进程状态、stderr 和本次完整命令，避免路径/权限/UNC 错误跳过候选 fallback。
      if (await isDelegatedWindowsExplorerExit(error, appPath, args, candidate)) {
        return { success: true };
      }
      lastError = stringifyError(error);
    }
  }

  logger.warn("[editors] 打开 WSL 工作区资源管理器失败", {
    path,
    candidates,
    error: lastError,
  });
    return {
        success: false,
        error: lastError || "failed to open WSL path in Explorer",
    };
}

async function openWindowsEditor(
  editorId: string,
  appPath: string,
  args: string[],
  cliError?: unknown,
): Promise<OpenInEditorResult> {
  try {
    await execFileAsync(appPath, args);
    return { success: true };
  } catch (error) {
    logger.warn("[editors] 打开 Windows 编辑器失败", {
      editorId,
      args,
      appPath,
      error: stringifyError(error),
      cliError: cliError === undefined ? undefined : stringifyError(cliError),
    });
    return { success: false, error: stringifyError(error) };
  }
}

/**
 * 用指定编辑器打开路径。
 */
export async function openInEditor(
  editorId: string,
  path: string,
  options?: OpenInEditorOptions,
): Promise<OpenInEditorResult> {
  const def = getEditorDefsForCurrentPlatform().find((editor) => editor.id === editorId);
  if (!def) {
    return { success: false, error: `unknown editor: ${editorId}` };
  }

  const fileApp = getFileApplicationDefs().find((app) => app.id === editorId);
  if (fileApp) {
    // 文档应用只能消费本机匹配类型的文件，不能把远端路径当成本机路径打开。
    if (
      options?.remoteTarget ||
      options?.pathKind === "directory" ||
      !(process.platform === "win32" ? win32.isAbsolute(path) : isAbsolute(path)) ||
      !matchesFileApplication(fileApp, path)
    ) {
      return { success: false, error: "unsupported file application target" };
    }
    // renderer 的 pathKind 不能证明文件存在；异步 stat 避免阻塞主进程。
    if (!(await stat(path).catch(() => null))?.isFile())
      return { success: false, error: "unsupported file application target" };
    const applicationPath = await resolveFileApplicationPath(fileApp);
    if (!applicationPath) return { success: false, error: "application is not installed" };
    try {
      if (process.platform === "darwin") {
        await execFileAsync("open", [
          "-a",
          applicationPath,
          path,
          ...(fileApp.launchArgs?.length ? ["--args", ...fileApp.launchArgs] : []),
        ]);
      } else {
        // 阅读器可能长时间运行并输出日志；不能用 execFile 缓冲输出或等待其退出。
        const child = spawn(applicationPath, [...(fileApp.launchArgs ?? []), path], {
          detached: true,
          stdio: "ignore",
          windowsHide: false,
        });
        await new Promise<void>((resolve, reject) => {
          child.once("spawn", resolve);
          child.once("error", reject);
        });
        child.unref();
      }
      return { success: true };
    } catch (error) {
      logger.warn("[editors] 打开文件应用失败", { editorId, path, error: stringifyError(error) });
      return { success: false, error: stringifyError(error) };
    }
  }

  const appPath = resolveEditorDefAppPath(def) ?? def.appPath;
  if (options?.remoteTarget?.kind === "ssh" && isVSCodeEditor(editorId)) {
    // SSH 工作区的 workspacePath 是远端文件系统路径，不能按本机路径执行 `code /root/...`。
    // VS Code Remote-SSH 需要 folder URI 才会连接对应 SSH Host 并打开远端目录。
    return openVSCodeRemoteSshFolder(
      editorId,
      appPath,
      def.command,
      path,
      options.remoteTarget,
      options.pathKind,
    );
  }

  if (options?.remoteTarget?.kind === "wsl" && isVSCodeEditor(editorId)) {
    // WSL 工作区的 workspacePath 是 Linux 路径，不能直接传给 Windows 侧 `code`。
    // VS Code Remote-WSL 需要 folder URI，才能在指定 distro 内打开同一个 Linux 目录。
    return openVSCodeRemoteWslFolder(
      editorId,
      appPath,
      def.command,
      path,
      options.remoteTarget,
      options.pathKind,
    );
  }

  if (options?.remoteTarget?.kind === "wsl" && editorId === "explorer") {
    // Windows 资源管理器无法理解 `/home/...` 这类 WSL 内部路径。
    // 仅在打开宿主应用的边界把路径转成 UNC，远端 host / agent 仍保留 Linux 路径语义。
    return openWslPathInExplorer(appPath, path, options.remoteTarget, options.pathKind);
  }

  const pathKind = detectPathKind(path);

  if (editorId === "finder") {
    if (pathKind === "file") {
      shell.showItemInFolder(path);
      return { success: true };
    }
    return openPathViaShell(path);
  }

  if (editorId === "explorer") {
    if (pathKind !== "file") {
      return openPathViaShell(path);
    }

    // Explorer 已委托打开请求后仍可能非零退出，按退出码回退会重复打开窗口。
    // 本地文件直接使用系统定位 API，只发出一次打开所在目录并选中文件的请求。
    shell.showItemInFolder(path);
    return { success: true };
  }

  if (def.command) {
        const openArgs = buildLocalEditorOpenArgs(editorId, path, options);
    try {
            await execFileAsync(def.command, openArgs);
      return { success: true };
    } catch (error) {
      if (process.platform === "win32") {
                return openWindowsEditor(editorId, appPath, openArgs, error);
      }

      try {
                await execFileAsync("open", buildMacOpenEditorArgs(appPath, openArgs));
        return { success: true };
      } catch (fallbackError) {
        logger.warn("[editors] 打开编辑器失败", {
          editorId,
          path,
          error: stringifyError(error),
          fallbackError: stringifyError(fallbackError),
        });
        return { success: false, error: stringifyError(fallbackError) };
      }
    }
  }

    const fallbackOpenArgs = buildLocalEditorOpenArgs(editorId, path, options);
  try {
    if (process.platform === "win32") {
            await execFileAsync(appPath, fallbackOpenArgs);
    } else {
            await execFileAsync("open", buildMacOpenEditorArgs(appPath, fallbackOpenArgs));
    }
    return { success: true };
  } catch (error) {
    logger.warn("[editors] 打开编辑器失败", {
      editorId,
      path,
      error: stringifyError(error),
    });
    return { success: false, error: stringifyError(error) };
  }
}
