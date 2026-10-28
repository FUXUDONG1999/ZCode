/* eslint-disable max-lines -- 编辑器检测需要集中维护跨平台路径、图标解析和缓存逻辑。 */
/**
 * 编辑器检测与打开 —— 检测系统中已安装的编辑器/终端，获取图标，打开路径
 *
 * 当前支持 macOS / Windows。Linux 后续再补。
 */

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join, win32 as pathWin32 } from "node:path";
import { app, nativeImage } from "electron";
import type { EditorInfo } from "@zcode/shared";
import { getZCodeDataRootDir } from "@zcode/services/node";
import { logger } from "./logger.js";
import {
  getFileApplicationDefs,
  matchesFileApplication,
  resolveFileApplicationPath,
} from "@desktop/main/fileApplications.js";

const require = createRequire(import.meta.url);
const WINDOWS_EXPLORER_PATH = pathWin32.join(process.env.WINDIR ?? "C:/Windows", "explorer.exe");

export interface EditorDef {
  id: string;
  name: string;
  /** macOS .app bundle 路径 */
  appPath: string;
  appPathCandidates?: string[];
  windowsCommandAppNames?: string[];
  /** CLI 命令名（如果有）。用于 open folder；null 则 fallback 到 `open -a` */
  command: string | null;
}

interface AppBundleInfoPlist {
  CFBundleIconFile?: string;
  CFBundleIconFiles?: string[];
  CFBundleIconName?: string;
  CFBundleIcons?: {
    CFBundlePrimaryIcon?: {
      CFBundleIconFiles?: string[];
      CFBundleIconName?: string;
    };
  };
}

interface ResolvedAppIconPath {
  candidateIconNames: string[];
  path: string | null;
  reason: "resolved" | "missing-plist" | "missing-icon-name" | "missing-icon-file";
}

interface ParsedIcnsPngCandidate {
  osType: string;
  size: number;
  image: Buffer;
}

interface MacToolboxAppScanOptions {
  /** 目录名命中前缀后，再排除匹配该正则的 .app（用于区分 Ultimate / Community）。 */
  excludeNamePattern?: RegExp;
}

/**
 * 扫描 macOS 上 JetBrains Toolbox 的安装位置，按产品名前缀匹配。
 * Toolbox 2.x（现行版本，官方定为固定路径）直接装到 ~/Applications，
 * 且产品名可能带 edition 后缀（IntelliJ IDEA Ultimate.app / PyCharm Professional.app），
 * 因此前缀匹配而不是写死完整路径；Toolbox 1.x（已停更）在 ~/Applications/JetBrains Toolbox
 * 下留符号链接壳，一并覆盖。静态白名单只查 /Applications，Toolbox 安装的 IDE 全部漏检。
 */
function findMacToolboxAppCandidates(
  appNamePrefix: string,
  options: MacToolboxAppScanOptions = {},
): string[] {
  const userApplicationsRoot = join(homedir(), "Applications");
  const roots = [userApplicationsRoot, join(userApplicationsRoot, "JetBrains Toolbox")];
  const candidates: string[] = [];

  for (const root of roots) {
    try {
      const entries = readdirSync(root, { withFileTypes: true })
        .filter(
          (entry) =>
            entry.isDirectory() &&
            entry.name.toLowerCase().startsWith(appNamePrefix.toLowerCase()) &&
            !(options.excludeNamePattern && options.excludeNamePattern.test(entry.name)),
        )
        .map((entry) => entry.name)
        .sort((left, right) => right.localeCompare(left));

      for (const entry of entries) {
        candidates.push(join(root, entry));
      }
    } catch {
      // ~/Applications 不存在（未用 Toolbox 安装）是正常情况。
    }
  }

  return candidates;
}

/** JetBrains 产品目录名带 Ultimate/Professional 等版本后缀时按产品前缀匹配。 */
function macJetBrainsAppCandidates(productName: string, excludeNamePattern?: RegExp): string[] {
  return excludeNamePattern
    ? findMacToolboxAppCandidates(productName, { excludeNamePattern })
    : findMacToolboxAppCandidates(productName);
}

const MAC_EDITOR_DEFS: EditorDef[] = [
  // 代码编辑器
  {
    id: "vscode",
    name: "VS Code",
    appPath: "/Applications/Visual Studio Code.app",
    command: "code",
  },
  // 这里之前只登记了稳定版 VS Code，`getInstalledEditors()` 又完全依赖这份静态白名单做 existsSync 过滤。
  // 用户安装的是 `Visual Studio Code - Insiders.app` 时，主进程根本不会把它纳入候选列表，UI 自然也就显示不出来。
  // 补上独立定义后，既能识别 Insiders，也能复用现有的 `code-insiders` CLI / `open -a` 降级打开链路。
  {
    id: "vscode-insiders",
    name: "VS Code Insiders",
    appPath: "/Applications/Visual Studio Code - Insiders.app",
    command: "code-insiders",
  },
  { id: "cursor", name: "Cursor", appPath: "/Applications/Cursor.app", command: "cursor" },
  { id: "trae", name: "Trae", appPath: "/Applications/Trae.app", command: null },
  { id: "zed", name: "Zed", appPath: "/Applications/Zed.app", command: "zed" },
  { id: "codebuddy", name: "CodeBuddy", appPath: "/Applications/CodeBuddy.app", command: null },
  { id: "qoder", name: "Qoder", appPath: "/Applications/Qoder.app", command: null },
  // JetBrains 系列。Toolbox 安装位置由 macJetBrainsAppCandidates 按产品前缀补齐。
  {
    id: "idea",
    name: "IntelliJ IDEA",
    appPath: "/Applications/IntelliJ IDEA.app",
    // Community/CE 有独立入口（idea-ce），Ultimate 的 Toolbox 目录名不含这些标记。
    appPathCandidates: macJetBrainsAppCandidates("IntelliJ IDEA", /community|(^|\s)ce\.app$/i),
    command: "idea",
  },
  {
    id: "idea-ce",
    name: "IntelliJ IDEA CE",
    appPath: "/Applications/IntelliJ IDEA CE.app",
    appPathCandidates: [
      "/Applications/IntelliJ IDEA Community Edition.app",
      ...macJetBrainsAppCandidates("IntelliJ IDEA Community"),
      ...macJetBrainsAppCandidates("IntelliJ IDEA CE"),
    ],
    command: "idea",
  },
  {
    id: "webstorm",
    name: "WebStorm",
    appPath: "/Applications/WebStorm.app",
    appPathCandidates: macJetBrainsAppCandidates("WebStorm"),
    command: "webstorm",
  },
  {
    id: "pycharm",
    name: "PyCharm",
    appPath: "/Applications/PyCharm.app",
    appPathCandidates: macJetBrainsAppCandidates("PyCharm"),
    command: "pycharm",
  },
  {
    id: "goland",
    name: "GoLand",
    appPath: "/Applications/GoLand.app",
    appPathCandidates: macJetBrainsAppCandidates("GoLand"),
    command: "goland",
  },
  {
    id: "phpstorm",
    name: "PhpStorm",
    appPath: "/Applications/PhpStorm.app",
    appPathCandidates: macJetBrainsAppCandidates("PhpStorm"),
    command: "phpstorm",
  },
  {
    id: "rider",
    name: "Rider",
    appPath: "/Applications/Rider.app",
    appPathCandidates: macJetBrainsAppCandidates("Rider"),
    command: "rider",
  },
  {
    id: "clion",
    name: "CLion",
    appPath: "/Applications/CLion.app",
    appPathCandidates: macJetBrainsAppCandidates("CLion"),
    command: "clion",
  },
  {
    id: "rubymine",
    name: "RubyMine",
    appPath: "/Applications/RubyMine.app",
    appPathCandidates: macJetBrainsAppCandidates("RubyMine"),
    command: "rubymine",
  },
  {
    id: "datagrip",
    name: "DataGrip",
    appPath: "/Applications/DataGrip.app",
    appPathCandidates: macJetBrainsAppCandidates("DataGrip"),
    command: "datagrip",
  },
  {
    id: "rustrover",
    name: "RustRover",
    appPath: "/Applications/RustRover.app",
    appPathCandidates: macJetBrainsAppCandidates("RustRover"),
    command: "rustrover",
  },
  // 终端
  { id: "warp", name: "Warp", appPath: "/Applications/Warp.app", command: null },
  // 文件管理器
  {
    id: "finder",
    name: "Finder",
    appPath: "/System/Library/CoreServices/Finder.app",
    command: null,
  },
  // 功能扩展：QSpace / QSpace Pro 是 macOS 第三方文件管理器，默认没有 CLI，复用 open -a app bundle 打开路径。
  {
    id: "qspace",
    name: "QSpace",
    appPath: "/Applications/QSpace.app",
    command: null,
  },
  {
    id: "qspace-pro",
    name: "QSpace Pro",
    appPath: "/Applications/QSpace Pro.app",
    command: null,
  },
];

function uniquePaths(paths: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      paths.filter((path): path is string => typeof path === "string" && path.trim().length > 0),
    ),
  );
}

function getWindowsProgramFilesRoots(): string[] {
  const systemDrive = process.env.SystemDrive || "C:";
  return uniquePaths([
    process.env.ProgramFiles,
    process.env["ProgramFiles(x86)"],
    `${systemDrive}\\Program Files`,
    `${systemDrive}\\Program Files (x86)`,
  ]);
}

function getWindowsLocalProgramsRoot(): string {
  const systemDrive = process.env.SystemDrive || "C:";
  return pathWin32.join(
    process.env.LOCALAPPDATA || `${systemDrive}\\Users\\Default\\AppData\\Local`,
    "Programs",
  );
}

function windowsLocalProgramCandidate(...segments: string[]): string {
  return pathWin32.join(getWindowsLocalProgramsRoot(), ...segments);
}

function windowsProgramFilesCandidates(...segments: string[]): string[] {
  return getWindowsProgramFilesRoots().map((root) => pathWin32.join(root, ...segments));
}

interface WindowsJetBrainsExecutableOptions {
  /** 目录名命中前缀后，再排除匹配该正则的目录（用于区分 Ultimate / Community）。 */
  excludeNamePattern?: RegExp;
}

function findWindowsJetBrainsExecutableCandidates(
  productDirPrefix: string,
  executableName: string,
  options: WindowsJetBrainsExecutableOptions = {},
): string[] {
  const roots = uniquePaths([
    ...getWindowsProgramFilesRoots().map((root) => pathWin32.join(root, "JetBrains")),
    pathWin32.join(getWindowsLocalProgramsRoot(), "JetBrains"),
    // Toolbox 2.x 默认把每个产品直接装到 Programs 根目录（如 Programs\IntelliJ IDEA Ultimate），
    // 不在 JetBrains 子目录下；漏掉这个根目录时 Toolbox 安装的全部产品都检测不到。
    getWindowsLocalProgramsRoot(),
  ]);
  const candidates: string[] = [];

  for (const root of roots) {
    try {
      const entries = readdirSync(root, { withFileTypes: true })
        .filter(
          (entry) =>
            entry.isDirectory() &&
            entry.name.toLowerCase().startsWith(productDirPrefix.toLowerCase()) &&
            !(options.excludeNamePattern && options.excludeNamePattern.test(entry.name)),
        )
        .map((entry) => entry.name)
        .sort((left, right) => right.localeCompare(left));

      for (const entry of entries) {
        candidates.push(pathWin32.join(root, entry, "bin", executableName));
      }
    } catch {
      // JetBrains products are optional; missing roots are expected.
    }
  }

  return candidates;
}

/** VS 磁盘目录使用内部版本号（如 VS 2026 = "18"），需映射回营销年份名。 */
const WINDOWS_VISUAL_STUDIO_INTERNAL_VERSION_YEARS: Record<string, string> = {
  "15": "2017",
  "16": "2019",
  "17": "2022",
  "18": "2026",
};

function resolveWindowsVisualStudioYearLabel(dirName: string): string | null {
  if (/^\d{4}$/.test(dirName)) {
    return dirName;
  }
  return WINDOWS_VISUAL_STUDIO_INTERNAL_VERSION_YEARS[dirName] ?? null;
}

/**
 * 扫描 Microsoft Visual Studio 的 `<year>\<edition>\Common7\IDE\devenv.exe`，
 * 每个年份版本生成一个候选（同年多 edition 时按 Enterprise > Professional > Community 优先）。
 */
function findWindowsVisualStudioEditorDefs(): EditorDef[] {
  const roots = uniquePaths(
    getWindowsProgramFilesRoots().map((root) => pathWin32.join(root, "Microsoft Visual Studio")),
  );
  const editionPreference = ["Enterprise", "Professional", "Community", "Preview"];
  const editionRank = (edition: string) => {
    const index = editionPreference.findIndex((candidate) =>
      edition.toLowerCase().includes(candidate.toLowerCase()),
    );
    return index === -1 ? editionPreference.length : index;
  };
  const defsByYear = new Map<string, EditorDef>();

  for (const root of roots) {
    try {
      const yearEntries = readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && resolveWindowsVisualStudioYearLabel(entry.name))
        .map((entry) => ({ dir: entry.name, year: resolveWindowsVisualStudioYearLabel(entry.name)! }))
        .sort((left, right) => Number(right.year) - Number(left.year));

      for (const { dir, year } of yearEntries) {
        if (defsByYear.has(`visual-studio-${year}`)) {
          continue;
        }

        const editions = readdirSync(pathWin32.join(root, dir), { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name)
          .sort((left, right) => editionRank(left) - editionRank(right));

        for (const edition of editions) {
          const devenvPath = pathWin32.join(
            root,
            dir,
            edition,
            "Common7",
            "IDE",
            "devenv.exe",
          );
          if (existsSync(devenvPath)) {
            defsByYear.set(`visual-studio-${year}`, {
              id: `visual-studio-${year}`,
              name: `Visual Studio ${year}`,
              appPath: devenvPath,
              appPathCandidates: [],
              windowsCommandAppNames: [],
              command: null,
            });
            break;
          }
        }
      }
    } catch {
      // Visual Studio is optional; missing roots are expected.
    }
  }

  return Array.from(defsByYear.values());
}

function createWindowsEditorDef(
  id: string,
  name: string,
  appPathCandidates: string[],
  command: string | null = null,
  windowsCommandAppNames: string[] = [],
): EditorDef {
  const candidates = uniquePaths(appPathCandidates);
  return {
    id,
    name,
    appPath: candidates[0] ?? "",
    appPathCandidates: candidates.slice(1),
    windowsCommandAppNames,
    command,
  };
}

function resolveWindowsCommandPaths(command: string): string[] {
  if (process.platform !== "win32") {
    return [];
  }

  try {
    const output = execFileSync("where.exe", [command], {
      encoding: "utf8",
      timeout: 1000,
      windowsHide: true,
    });
    return output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && existsSync(line));
  } catch {
    return [];
  }
}

function deriveWindowsAppPathsFromCommand(command: string, appNames: string[]): string[] {
  const candidates: string[] = [];

  for (const commandPath of resolveWindowsCommandPaths(command)) {
    const commandDir = pathWin32.dirname(commandPath);
    for (const appRoot of uniquePaths([commandDir, pathWin32.dirname(commandDir)])) {
      for (const appName of appNames) {
        candidates.push(pathWin32.join(appRoot, appName));
      }
    }
  }

  // Windows PATH 常见的是 bin\code.cmd 这类 shim，真实 exe 才能提供和 mac 一致的应用图标。
  return uniquePaths(candidates).filter((candidate) => existsSync(candidate));
}

const WINDOWS_EDITOR_DEFS: EditorDef[] = [
  // Workspace 顶部“Open in Editor”以前只把真正的 IDE 暴露给 UI，
  // Windows 用户缺少最基础的“在资源管理器里打开”入口，只能回到其它菜单操作。
  // 这里把系统文件管理器也作为 editor 列表的一员，让 macOS Finder / Windows 资源管理器体验对齐。
  { id: "explorer", name: "资源管理器", appPath: WINDOWS_EXPLORER_PATH, command: null },
];

const WINDOWS_ADDITIONAL_EDITOR_DEFS: EditorDef[] = [
  createWindowsEditorDef(
    "vscode",
    "VS Code",
    [
      windowsLocalProgramCandidate("Microsoft VS Code", "Code.exe"),
      ...windowsProgramFilesCandidates("Microsoft VS Code", "Code.exe"),
    ],
    "code",
    ["Code.exe"],
  ),
  createWindowsEditorDef(
    "vscode-insiders",
    "VS Code Insiders",
    [
      windowsLocalProgramCandidate("Microsoft VS Code Insiders", "Code - Insiders.exe"),
      ...windowsProgramFilesCandidates("Microsoft VS Code Insiders", "Code - Insiders.exe"),
    ],
    "code-insiders",
    ["Code - Insiders.exe"],
  ),
  createWindowsEditorDef(
    "cursor",
    "Cursor",
    [
      windowsLocalProgramCandidate("Cursor", "Cursor.exe"),
      ...windowsProgramFilesCandidates("Cursor", "Cursor.exe"),
    ],
    "cursor",
    ["Cursor.exe"],
  ),
  createWindowsEditorDef("trae", "Trae", [
    windowsLocalProgramCandidate("Trae", "Trae.exe"),
    windowsLocalProgramCandidate("Trae CN", "Trae.exe"),
    windowsLocalProgramCandidate("Trae CN", "Trae CN.exe"),
    ...windowsProgramFilesCandidates("Trae", "Trae.exe"),
    ...windowsProgramFilesCandidates("Trae CN", "Trae.exe"),
    ...windowsProgramFilesCandidates("Trae CN", "Trae CN.exe"),
  ]),
  createWindowsEditorDef("idea", "IntelliJ IDEA", [
    ...findWindowsJetBrainsExecutableCandidates("IntelliJ IDEA", "idea64.exe", {
      // Community Edition 有独立入口（idea-ce）；Ultimate 目录名不含 Community。
      excludeNamePattern: /community/i,
    }),
  ]),
  createWindowsEditorDef("idea-ce", "IntelliJ IDEA CE", [
    ...findWindowsJetBrainsExecutableCandidates("IntelliJ IDEA Community", "idea64.exe"),
  ]),
  createWindowsEditorDef("webstorm", "WebStorm", [
    ...findWindowsJetBrainsExecutableCandidates("WebStorm", "webstorm64.exe"),
  ]),
  createWindowsEditorDef("pycharm", "PyCharm", [
    ...findWindowsJetBrainsExecutableCandidates("PyCharm", "pycharm64.exe"),
  ]),
  createWindowsEditorDef("goland", "GoLand", [
    ...findWindowsJetBrainsExecutableCandidates("GoLand", "goland64.exe"),
  ]),
  createWindowsEditorDef("phpstorm", "PhpStorm", [
    ...findWindowsJetBrainsExecutableCandidates("PhpStorm", "phpstorm64.exe"),
  ]),
  createWindowsEditorDef("rider", "Rider", [
    ...findWindowsJetBrainsExecutableCandidates("Rider", "rider64.exe"),
  ]),
  createWindowsEditorDef("clion", "CLion", [
    ...findWindowsJetBrainsExecutableCandidates("CLion", "clion64.exe"),
  ]),
  createWindowsEditorDef("rubymine", "RubyMine", [
    ...findWindowsJetBrainsExecutableCandidates("RubyMine", "rubymine64.exe"),
  ]),
  createWindowsEditorDef("datagrip", "DataGrip", [
    ...findWindowsJetBrainsExecutableCandidates("DataGrip", "datagrip64.exe"),
  ]),
  createWindowsEditorDef("rustrover", "RustRover", [
    ...findWindowsJetBrainsExecutableCandidates("RustRover", "rustrover64.exe"),
  ]),
  // Visual Studio（2022/2026 等）按年份目录动态检测，只登记本机真实存在的 devenv.exe。
  ...findWindowsVisualStudioEditorDefs(),
];

export function getEditorDefsForCurrentPlatform(): EditorDef[] {
  if (process.platform === "darwin") {
    return [...MAC_EDITOR_DEFS, ...getFileApplicationDefs()];
  }

  if (process.platform === "win32") {
    return [...WINDOWS_EDITOR_DEFS, ...WINDOWS_ADDITIONAL_EDITOR_DEFS, ...getFileApplicationDefs()];
  }

  return getFileApplicationDefs();
}

/** 缓存检测结果，避免重复 IO */
export function resolveEditorDefAppPath(def: EditorDef): string | null {
  const commandAppPaths =
    def.command && def.windowsCommandAppNames?.length
      ? deriveWindowsAppPathsFromCommand(def.command, def.windowsCommandAppNames)
      : [];
  const commandPaths =
    process.platform === "win32" && def.windowsCommandAppNames?.length
      ? []
      : def.command
        ? resolveWindowsCommandPaths(def.command)
        : [];
  const candidatePaths = uniquePaths([
    def.appPath,
    ...(def.appPathCandidates ?? []),
    ...commandAppPaths,
    ...commandPaths,
  ]);
  return candidatePaths.find((candidate) => existsSync(candidate)) ?? null;
}

let cachedEditors: EditorInfo[] | null = null;
let cachedIcnsModule: typeof import("@fiahfy/icns") | null | undefined;

function getIcnsModule(): typeof import("@fiahfy/icns") | null {
  if (cachedIcnsModule !== undefined) {
    return cachedIcnsModule;
  }

  try {
    cachedIcnsModule = require("@fiahfy/icns") as typeof import("@fiahfy/icns");
  } catch (error) {
    // 这里之前在模块顶层直接 require("@fiahfy/icns")。
    // 一旦安装包漏掉它的子依赖（这次是 pngjs），主进程会在文件加载阶段直接崩溃，
    // 连后面的 sips / file icon 降级路径都来不及执行。改成按需懒加载后，缺包时只降级图标解析。
    cachedIcnsModule = null;
    logger.warn("[editors] 加载 @fiahfy/icns 失败，图标解析将回退到 sips", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return cachedIcnsModule;
}

function readAppBundleInfoPlist(appPath: string): AppBundleInfoPlist | null {
  try {
    const infoPlistPath = join(appPath, "Contents", "Info.plist");
    const raw = execFileSync("plutil", ["-convert", "json", "-o", "-", infoPlistPath], {
      encoding: "utf8",
      timeout: 3000,
    });
    return JSON.parse(raw) as AppBundleInfoPlist;
  } catch (error) {
    logger.warn("[editors] 读取 Info.plist 失败，图标将回退到 file icon", {
      appPath,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function resolveAppIconPath(appPath: string): ResolvedAppIconPath {
  const plist = readAppBundleInfoPlist(appPath);
  if (!plist) {
    return {
      candidateIconNames: [],
      path: null,
      reason: "missing-plist",
    };
  }

  // `defaults read` 对不少第三方 .app 读不到 CFBundleIconFile，
  // 会让所有编辑器误回退到 Electron 的通用文件图标；这里改为直接解析 Info.plist。
  const iconNames = [
    plist.CFBundleIconFile,
    ...(plist.CFBundleIconFiles ?? []),
    ...(plist.CFBundleIcons?.CFBundlePrimaryIcon?.CFBundleIconFiles ?? []),
    plist.CFBundleIcons?.CFBundlePrimaryIcon?.CFBundleIconName,
    plist.CFBundleIconName,
  ].filter(
    (iconName): iconName is string => typeof iconName === "string" && iconName.trim().length > 0,
  );

  if (iconNames.length === 0) {
    return {
      candidateIconNames: [],
      path: null,
      reason: "missing-icon-name",
    };
  }

  for (const iconName of iconNames) {
    const candidateFileNames = iconName.endsWith(".icns")
      ? [iconName]
      : [iconName, `${iconName}.icns`];

    for (const candidateFileName of candidateFileNames) {
      const candidatePath = join(appPath, "Contents", "Resources", candidateFileName);
      // Ghostty 这类应用会同时存在同名资源目录和真正的 .icns 文件。
      // 之前这里只判断 existsSync，先命中目录后就会把目录当成图标文件读，
      // 最终解析失败并退回成发白的系统 file icon。这里要求候选路径必须是文件。
      if (existsSync(candidatePath) && statSync(candidatePath).isFile()) {
        return {
          candidateIconNames: iconNames,
          path: candidatePath,
          reason: "resolved",
        };
      }
    }
  }

  return {
    candidateIconNames: iconNames,
    path: null,
    reason: "missing-icon-file",
  };
}

function loadNativeImageFromIcnsViaPackage(
  editorId: string,
  appPath: string,
  icnsPath: string,
): Electron.NativeImage | null {
  const icnsModule = getIcnsModule();
  if (!icnsModule) {
    return null;
  }

  const { Icns } = icnsModule;

  try {
    const icnsBuffer = readFileSync(icnsPath);
    const icns = Icns.from(icnsBuffer);
    const pngCandidates = icns.images
      .map((image): ParsedIcnsPngCandidate | null => {
        const supportedIconType = Icns.supportedIconTypes.find(
          (iconType) => iconType.osType === image.osType,
        );
        if (!supportedIconType || supportedIconType.format !== "PNG") {
          return null;
        }
        return {
          osType: image.osType,
          size: supportedIconType.size,
          image: image.image,
        };
      })
      .filter((candidate): candidate is ParsedIcnsPngCandidate => candidate !== null)
      .sort((left, right) => right.size - left.size);

    if (pngCandidates.length === 0) {
      logger.info("[editors] @fiahfy/icns 未解析到 PNG icon，图标将回退到 sips", {
        editorId,
        appPath,
        icnsPath,
        availableIconTypes: icns.images.map((image) => image.osType),
      });
      return null;
    }

    for (const candidate of pngCandidates) {
      const icon = nativeImage.createFromBuffer(candidate.image);
      if (!icon.isEmpty()) {
        return icon;
      }
    }

    logger.warn("[editors] @fiahfy/icns 已解析到 PNG icon，但 nativeImage 仍为空", {
      editorId,
      appPath,
      icnsPath,
      pngCandidateTypes: pngCandidates.map((candidate) => `${candidate.osType}:${candidate.size}`),
    });
    return null;
  } catch (error) {
    logger.warn("[editors] @fiahfy/icns 解析失败，图标将回退到 sips", {
      editorId,
      appPath,
      icnsPath,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function loadNativeImageFromIcnsViaSips(
  editorId: string,
  appPath: string,
  icnsPath: string,
): Electron.NativeImage | null {
  const tempRootDir = join(getZCodeDataRootDir(), "editor-icon");
  mkdirSync(tempRootDir, { recursive: true });
  const tempDirPath = mkdtempSync(join(tempRootDir, "icon-"));
  const tempPngPath = join(tempDirPath, "icon.png");

  try {
    execFileSync("sips", ["-s", "format", "png", icnsPath, "--out", tempPngPath], {
      encoding: "utf8",
      timeout: 5000,
    });
    const pngBuffer = readFileSync(tempPngPath);
    const icon = nativeImage.createFromBuffer(pngBuffer);
    if (icon.isEmpty()) {
      logger.warn("[editors] sips 已输出 PNG，但 nativeImage 仍为空", {
        editorId,
        appPath,
        icnsPath,
        tempPngPath,
      });
      return null;
    }
    return icon;
  } catch (error) {
    logger.warn("[editors] .icns 转 PNG 失败，图标将回退到 file icon", {
      editorId,
      appPath,
      icnsPath,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  } finally {
    try {
      rmSync(tempDirPath, { recursive: true, force: true });
    } catch {
      // 临时目录清理失败不影响图标加载
    }
  }
}

function loadNativeImageFromIcns(
  editorId: string,
  appPath: string,
  icnsPath: string,
): Electron.NativeImage | null {
  // Electron 的 nativeImage 不适合直接读取 .icns，
  // 这里优先用 npm 包解析出 PNG icon，减少每个图标都起系统子进程的成本；
  // 只有遇到老格式或包解析不到的 case，才回退到 macOS 的 sips。
  return (
    loadNativeImageFromIcnsViaPackage(editorId, appPath, icnsPath) ??
    loadNativeImageFromIcnsViaSips(editorId, appPath, icnsPath)
  );
}

/**
 * 从 .app bundle 的 Info.plist 读取多个可能的 icon 字段，
 * 然后把 .icns 转成 PNG，再生成可用于菜单的真实图标。
 * 如果解析不到真实图标，再 fallback 到 Electron 的 app.getFileIcon。
 */
export function getAppIconDataUrl(editorId: string, appPath: string): Promise<string | null> {
  if (process.platform !== "darwin") {
    return app
      .getFileIcon(appPath, { size: "normal" })
      .then((icon) => `data:image/png;base64,${icon.toPNG().toString("base64")}`)
      .catch((error) => {
        logger.warn("[editors] 获取 file icon 失败", {
          editorId,
          appPath,
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      });
  }
  // Step 1: 尝试从 .icns 文件加载真实 app 图标
  const resolvedIcon = resolveAppIconPath(appPath);
  if (resolvedIcon.path) {
    const icon = loadNativeImageFromIcns(editorId, appPath, resolvedIcon.path);
    if (icon && !icon.isEmpty()) {
      // 缩放到合适大小（32x32 用于菜单显示）
      const resized = icon.resize({ width: 32, height: 32 });
      return Promise.resolve(`data:image/png;base64,${resized.toPNG().toString("base64")}`);
    }
  } else {
    logger.info("[editors] 未解析到真实 app 图标，图标将回退到 file icon", {
      editorId,
      appPath,
      reason: resolvedIcon.reason,
      candidateIconNames: resolvedIcon.candidateIconNames,
    });
  }

  // Step 2: fallback 到 Electron 的 app.getFileIcon
  return app
    .getFileIcon(appPath, { size: "normal" })
    .then((icon) => `data:image/png;base64,${icon.toPNG().toString("base64")}`)
    .catch((error) => {
      logger.warn("[editors] 获取 file icon 失败", {
        editorId,
        appPath,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    });
}

/**
 * 检测系统中已安装的编辑器/终端，返回带图标的列表。
 * 结果会被缓存（应用生命周期内不变）。
 */
async function getBaseInstalledEditors(): Promise<EditorInfo[]> {
  if (cachedEditors) {
    return cachedEditors;
  }

  const installed = getEditorDefsForCurrentPlatform()
    .filter((def) => !("fileExtensions" in def))
    .map((def) => {
      const appPath = resolveEditorDefAppPath(def);
      return appPath ? { def, appPath } : null;
    })
    .filter((entry): entry is { def: EditorDef; appPath: string } => entry !== null);

  const results = await Promise.all(
    installed.map(async ({ def, appPath }) => {
      const iconDataUrl = await getAppIconDataUrl(def.id, appPath);
      if (!iconDataUrl) {
        return null;
      }
      return { id: def.id, name: def.name, iconDataUrl };
    }),
  );

  cachedEditors = results.filter((r): r is EditorInfo => r !== null);
  return cachedEditors;
}

const cachedFileApps = new Map<string, Promise<EditorInfo | null>>();

/** 可选文件路径只扩展文件菜单，工作区编辑器列表保持原有语义。 */
export async function getInstalledEditors(filePath?: string): Promise<EditorInfo[]> {
  const base = await getBaseInstalledEditors();
  const matching = getFileApplicationDefs().filter((def) => matchesFileApplication(def, filePath));
  const applications = await Promise.all(
    matching.map((def) => {
      let pending = cachedFileApps.get(def.id);
      if (!pending) {
        pending = (async () => {
          const appPath = await resolveFileApplicationPath(def);
          if (!appPath) return null;
          const iconDataUrl = await getAppIconDataUrl(def.id, appPath);
          return iconDataUrl ? { id: def.id, name: def.name, iconDataUrl } : null;
        })();
        cachedFileApps.set(def.id, pending);
        // 未安装或图标暂不可用不能永久缓存；并发查询仍共享同一次探测。
        const evict = () => {
          if (cachedFileApps.get(def.id) === pending) cachedFileApps.delete(def.id);
        };
        void pending.then((editor) => {
          if (!editor) evict();
        }, evict);
      }
      return pending;
    }),
  );
  return [...base, ...applications.filter((entry): entry is EditorInfo => entry !== null)];
}
