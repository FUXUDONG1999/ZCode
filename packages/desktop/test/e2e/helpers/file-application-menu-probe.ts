import {
  PlatformChannels,
  type EditorInfo,
  type FileApplicationInfo,
  type FileApplicationTarget,
} from "@zcode/shared";

type Handler = (...args: unknown[]) => unknown;
declare global {
  var __apcFileApplications:
    | {
        calls: Array<{ applicationId: string; target: FileApplicationTarget }>;
        restore(): void;
      }
    | undefined;
}

/**
 * 只在隔离 E2E 主进程替换目标文件的 IPC；不启动或安装任何真实外部应用。
 * 打开方式菜单会并入 getInstalledEditors 的编辑器条目（MYAGENT-FEATURES #30），
 * 受控场景默认把编辑器固定为空，避免断言随宿主机安装状态漂移。
 */
export async function installFileApplicationMenuProbe(
  targetPath: string,
  applications: FileApplicationInfo[],
  editors: EditorInfo[] = [],
) {
  await browser.electron.execute(
    (electron, channels, targetPath, applications, editors) => {
      if (globalThis.__apcFileApplications)
        throw new Error("File application probe already installed");
      const handlers = (electron.ipcMain as unknown as { _invokeHandlers: Map<string, Handler> })
        ._invokeHandlers;
      const query = handlers.get(channels.GetFileApplications);
      const open = handlers.get(channels.OpenFileWithApplication);
      const queryEditors = handlers.get(channels.GetInstalledEditors);
      if (!query || !open || !queryEditors)
        throw new Error("File application IPC handlers unavailable");
      const probe = {
        calls: [] as Array<{ applicationId: string; target: FileApplicationTarget }>,
        restore() {
          handlers.set(channels.GetFileApplications, query);
          handlers.set(channels.OpenFileWithApplication, open);
          handlers.set(channels.GetInstalledEditors, queryEditors);
          delete globalThis.__apcFileApplications;
        },
      };
      handlers.set(channels.GetFileApplications, (event, target) =>
        (target as FileApplicationTarget)?.path === targetPath
          ? applications
          : query(event, target),
      );
      handlers.set(channels.OpenFileWithApplication, (event, payload) => {
        const request = payload as { applicationId: string; target: FileApplicationTarget };
        if (request?.target?.path !== targetPath) return open(event, payload);
        probe.calls.push(request);
        return { success: true };
      });
      handlers.set(channels.GetInstalledEditors, (event, filePath) =>
        typeof filePath === "string" ? queryEditors(event, filePath) : editors,
      );
      globalThis.__apcFileApplications = probe;
    },
    PlatformChannels,
    targetPath,
    applications,
    editors,
  );
}

export async function readFileApplicationMenuProbe() {
  return browser.electron.execute(() => globalThis.__apcFileApplications?.calls ?? []);
}

export async function restoreFileApplicationMenuProbe() {
  await browser.electron.execute(() => globalThis.__apcFileApplications?.restore());
}
