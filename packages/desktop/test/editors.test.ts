import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: {
    getFileIcon: vi.fn(),
  },
  nativeImage: {
    createFromBuffer: vi.fn(),
  },
}));

vi.mock("../src/main/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(process, "platform");

function setProcessPlatform(platform: NodeJS.Platform) {
  Object.defineProperty(process, "platform", { value: platform });
}

afterEach(() => {
  if (originalPlatformDescriptor) {
    Object.defineProperty(process, "platform", originalPlatformDescriptor);
  }
  vi.doUnmock("node:child_process");
  vi.doUnmock("node:fs");
  vi.doUnmock("node:os");
  vi.doUnmock("../src/main/fileApplications.js");
  vi.restoreAllMocks();
  vi.resetModules();
});

async function importEditorsWithWindowsCommandMocks(
  existingPaths: string[],
  whereOutput: string,
  whereError?: Error,
) {
  setProcessPlatform("win32");
  const existingPathSet = new Set(existingPaths);

  vi.doMock("node:fs", async () => {
    const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
    return {
      ...actual,
      existsSync: vi.fn((path: string) => existingPathSet.has(path)),
    };
  });

  vi.doMock("node:child_process", async () => {
    const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
    return {
      ...actual,
      execFileSync: vi.fn((file: string, args: string[]) => {
        if (file === "where.exe" && args[0] === "code") {
          if (whereError) {
            throw whereError;
          }
          return whereOutput;
        }
        return "";
      }),
    };
  });

  return import("../src/main/editors.js");
}

describe("editors", () => {
  it("macOS 应把 VS Code Insiders 识别为可用编辑器", async () => {
    setProcessPlatform("darwin");

    const { getEditorDefsForCurrentPlatform } = await import("../src/main/editors.js");

    expect(getEditorDefsForCurrentPlatform()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "vscode-insiders",
          name: "VS Code Insiders",
          appPath: "/Applications/Visual Studio Code - Insiders.app",
          command: "code-insiders",
        }),
      ]),
    );
  });

  it("macOS 应把 QSpace 和 QSpace Pro 识别为可用的第三方文件管理器", async () => {
    setProcessPlatform("darwin");

    const { getEditorDefsForCurrentPlatform } = await import("../src/main/editors.js");

    expect(getEditorDefsForCurrentPlatform()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "qspace",
          name: "QSpace",
          appPath: "/Applications/QSpace.app",
          command: null,
        }),
        expect.objectContaining({
          id: "qspace-pro",
          name: "QSpace Pro",
          appPath: "/Applications/QSpace Pro.app",
          command: null,
        }),
      ]),
    );
  });

  it("macOS 不再登记 Sublime Text 与 Terminal/iTerm/Ghostty 入口", async () => {
    setProcessPlatform("darwin");

    const { getEditorDefsForCurrentPlatform } = await import("../src/main/editors.js");
    const editorIds = getEditorDefsForCurrentPlatform().map((editor) => editor.id);

    expect(editorIds).not.toContain("sublime");
    expect(editorIds).not.toContain("terminal");
    expect(editorIds).not.toContain("iterm2");
    expect(editorIds).not.toContain("ghostty");
  });

  it("Windows 应把常见 IDE 纳入 workspace 顶部打开菜单候选", async () => {
    setProcessPlatform("win32");

    const { getEditorDefsForCurrentPlatform } = await import("../src/main/editors.js");
    const editorIds = getEditorDefsForCurrentPlatform().map((editor) => editor.id);

    expect(editorIds).toEqual(
      expect.arrayContaining([
        "explorer",
        "vscode",
        "trae",
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
      ]),
    );
  });

  async function importEditorsWithWindowsDirectoryMocks(
    directories: Map<string, Array<string | { name: string }>>,
    existingPaths: string[],
  ) {
    setProcessPlatform("win32");
    const existingPathSet = new Set(existingPaths);
    const toEntry = (entry: string | { name: string }) =>
      typeof entry === "string" ? { name: entry, isDirectory: () => true } : entry;

    vi.doMock("node:fs", async () => {
      const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
      return {
        ...actual,
        existsSync: vi.fn((path: string) => existingPathSet.has(path)),
        readdirSync: vi.fn((path: string) => {
          const entries = directories.get(path);
          if (!entries) {
            throw Object.assign(new Error(`ENOENT: ${path}`), { code: "ENOENT" });
          }
          return entries.map(toEntry);
        }),
      };
    });

    return import("../src/main/editors.js");
  }

  function withWindowsProgramEnv<T>(run: () => Promise<T>): Promise<T> {
    const saved = {
      LOCALAPPDATA: process.env.LOCALAPPDATA,
      ProgramFiles: process.env.ProgramFiles,
      "ProgramFiles(x86)": process.env["ProgramFiles(x86)"],
      SystemDrive: process.env.SystemDrive,
    };
    process.env.LOCALAPPDATA = "C:\\Users\\test\\AppData\\Local";
    process.env.ProgramFiles = "C:\\Program Files";
    process.env["ProgramFiles(x86)"] = "C:\\Program Files (x86)";
    process.env.SystemDrive = "C:";
    return run().finally(() => {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    });
  }

  it("Windows 应识别 Toolbox 2.x 直接装在 Programs 根目录下的 JetBrains IDE", async () => {
    const toolboxDir = "C:\\Users\\test\\AppData\\Local\\Programs\\IntelliJ IDEA Ultimate";
    await withWindowsProgramEnv(async () => {
      const { getEditorDefsForCurrentPlatform, resolveEditorDefAppPath } =
        await importEditorsWithWindowsDirectoryMocks(
          new Map([["C:\\Users\\test\\AppData\\Local\\Programs", ["IntelliJ IDEA Ultimate"]]]),
          [`${toolboxDir}\\bin\\idea64.exe`],
        );

      const ideaDef = getEditorDefsForCurrentPlatform().find((editor) => editor.id === "idea");
      const ideaCeDef = getEditorDefsForCurrentPlatform().find((editor) => editor.id === "idea-ce");

      expect(ideaDef ? resolveEditorDefAppPath(ideaDef) : null).toBe(
        `${toolboxDir}\\bin\\idea64.exe`,
      );
      expect(ideaCeDef ? resolveEditorDefAppPath(ideaCeDef) : null).toBeNull();
    });
  });

  it("Windows 应把 IntelliJ IDEA 社区版识别为独立入口而不是 Ultimate", async () => {
    const communityDir = "C:\\Users\\test\\AppData\\Local\\Programs\\IntelliJ IDEA Community Edition";
    await withWindowsProgramEnv(async () => {
      const { getEditorDefsForCurrentPlatform, resolveEditorDefAppPath } =
        await importEditorsWithWindowsDirectoryMocks(
          new Map([
            ["C:\\Users\\test\\AppData\\Local\\Programs", ["IntelliJ IDEA Community Edition"]],
          ]),
          [`${communityDir}\\bin\\idea64.exe`],
        );

      const ideaDef = getEditorDefsForCurrentPlatform().find((editor) => editor.id === "idea");
      const ideaCeDef = getEditorDefsForCurrentPlatform().find((editor) => editor.id === "idea-ce");

      expect(ideaDef ? resolveEditorDefAppPath(ideaDef) : null).toBeNull();
      expect(ideaCeDef ? resolveEditorDefAppPath(ideaCeDef) : null).toBe(
        `${communityDir}\\bin\\idea64.exe`,
      );
    });
  });

  it("Windows 应按年份目录检测本机安装的 Visual Studio devenv", async () => {
    // VS 磁盘目录使用内部版本号（VS 2026 = "18"），需要映射回营销年份名。
    const devenv2026Path =
      "C:\\Program Files\\Microsoft Visual Studio\\18\\Enterprise\\Common7\\IDE\\devenv.exe";
    const devenv2022FromInternalPath =
      "C:\\Program Files\\Microsoft Visual Studio\\17\\Community\\Common7\\IDE\\devenv.exe";
    const devenv2022FromYearPath =
      "C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\Professional\\Common7\\IDE\\devenv.exe";
    await withWindowsProgramEnv(async () => {
      const { getEditorDefsForCurrentPlatform, resolveEditorDefAppPath } =
        await importEditorsWithWindowsDirectoryMocks(
          new Map([
            ["C:\\Program Files\\Microsoft Visual Studio", ["18", "17"]],
            ["C:\\Program Files (x86)\\Microsoft Visual Studio", ["2022"]],
            ["C:\\Program Files\\Microsoft Visual Studio\\18", ["Enterprise"]],
            ["C:\\Program Files\\Microsoft Visual Studio\\17", ["Community"]],
            ["C:\\Program Files (x86)\\Microsoft Visual Studio\\2022", ["Professional"]],
          ]),
          [devenv2026Path, devenv2022FromInternalPath, devenv2022FromYearPath],
        );

      const defs = getEditorDefsForCurrentPlatform();
      const vs2026Def = defs.find((editor) => editor.id === "visual-studio-2026");
      const vs2022Defs = defs.filter((editor) => editor.id === "visual-studio-2022");

      expect(vs2026Def).toEqual(
        expect.objectContaining({ id: "visual-studio-2026", name: "Visual Studio 2026" }),
      );
      expect(vs2026Def ? resolveEditorDefAppPath(vs2026Def) : null).toBe(devenv2026Path);
      // "17"（内部版本号）与 "2022"（年份目录）指向同一年份版本，只登记一个入口。
      expect(vs2022Defs.length).toBe(1);
      expect(vs2022Defs[0] ? resolveEditorDefAppPath(vs2022Defs[0]) : null).toBe(
        devenv2022FromInternalPath,
      );
    });
  });

  const MAC_FAKE_HOME = "C:\\Users\\mac-test";

  async function importEditorsWithMacDirectoryMocks(
    directories: Map<string, Array<string>>,
    existingPaths: string[],
  ) {
    setProcessPlatform("darwin");
    const existingPathSet = new Set(existingPaths);
    const toEntry = (entry: string) => ({ name: entry, isDirectory: () => true });

    vi.doMock("node:os", async () => {
      const actual = await vi.importActual<typeof import("node:os")>("node:os");
      return { ...actual, homedir: () => MAC_FAKE_HOME };
    });

    vi.doMock("node:fs", async () => {
      const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
      return {
        ...actual,
        existsSync: vi.fn((path: string) => existingPathSet.has(path)),
        readdirSync: vi.fn((path: string) => {
          const entries = directories.get(path);
          if (!entries) {
            throw Object.assign(new Error(`ENOENT: ${path}`), { code: "ENOENT" });
          }
          return entries.map(toEntry);
        }),
      };
    });

    return import("../src/main/editors.js");
  }

  it("macOS 应识别 Toolbox 2.x 装在 ~/Applications 下的 JetBrains IDE(含 edition 后缀)", async () => {
    const toolboxApp = `${MAC_FAKE_HOME}\\Applications\\IntelliJ IDEA Ultimate.app`;
    const { getEditorDefsForCurrentPlatform, resolveEditorDefAppPath } =
      await importEditorsWithMacDirectoryMocks(
        new Map([[`${MAC_FAKE_HOME}\\Applications`, ["IntelliJ IDEA Ultimate.app"]]]),
        [toolboxApp],
      );

    const defs = getEditorDefsForCurrentPlatform();
    const ideaDef = defs.find((editor) => editor.id === "idea");
    const ideaCeDef = defs.find((editor) => editor.id === "idea-ce");

    expect(ideaDef ? resolveEditorDefAppPath(ideaDef) : null).toBe(toolboxApp);
    expect(ideaCeDef ? resolveEditorDefAppPath(ideaCeDef) : null).toBeNull();
    // RustRover 与 Windows 侧同步补齐。
    expect(defs.find((editor) => editor.id === "rustrover")).toEqual(
      expect.objectContaining({ id: "rustrover", name: "RustRover" }),
    );
  });

  it("macOS 应把 Toolbox 的 IntelliJ IDEA 社区版识别为独立入口而不是 Ultimate", async () => {
    const communityApp = `${MAC_FAKE_HOME}\\Applications\\IntelliJ IDEA Community Edition.app`;
    const { getEditorDefsForCurrentPlatform, resolveEditorDefAppPath } =
      await importEditorsWithMacDirectoryMocks(
        new Map([[`${MAC_FAKE_HOME}\\Applications`, ["IntelliJ IDEA Community Edition.app"]]]),
        [communityApp],
      );

    const defs = getEditorDefsForCurrentPlatform();
    const ideaDef = defs.find((editor) => editor.id === "idea");
    const ideaCeDef = defs.find((editor) => editor.id === "idea-ce");

    expect(ideaDef ? resolveEditorDefAppPath(ideaDef) : null).toBeNull();
    expect(ideaCeDef ? resolveEditorDefAppPath(ideaCeDef) : null).toBe(communityApp);
  });

  it("macOS 应识别 Toolbox 1.x 符号链接壳下的 JetBrains IDE", async () => {
    const legacyApp = `${MAC_FAKE_HOME}\\Applications\\JetBrains Toolbox\\WebStorm.app`;
    const { getEditorDefsForCurrentPlatform, resolveEditorDefAppPath } =
      await importEditorsWithMacDirectoryMocks(
        new Map([[`${MAC_FAKE_HOME}\\Applications\\JetBrains Toolbox`, ["WebStorm.app"]]]),
        [legacyApp],
      );

    const webstormDef = getEditorDefsForCurrentPlatform().find((editor) => editor.id === "webstorm");
    expect(webstormDef ? resolveEditorDefAppPath(webstormDef) : null).toBe(legacyApp);
  });

  it("Windows requires PATH shims to resolve to a real app exe before showing gui editors", async () => {
    const shimPath = "D:\\Microsoft VS Code\\bin\\code";
    const { resolveEditorDefAppPath } = await importEditorsWithWindowsCommandMocks(
      [shimPath],
      `${shimPath}\r\n`,
    );

    expect(
      resolveEditorDefAppPath({
        id: "vscode",
        name: "VS Code",
        appPath: "C:\\missing\\Code.exe",
        command: "code",
        windowsCommandAppNames: ["Code.exe"],
      }),
    ).toBeNull();
  });

  it("Windows derives the real app exe from PATH shims for display and opening", async () => {
    const shimPath = "D:\\Microsoft VS Code\\bin\\code";
    const appPath = "D:\\Microsoft VS Code\\Code.exe";
    const { resolveEditorDefAppPath } = await importEditorsWithWindowsCommandMocks(
      [shimPath, appPath],
      `${shimPath}\r\n`,
    );

    expect(
      resolveEditorDefAppPath({
        id: "vscode",
        name: "VS Code",
        appPath: "C:\\missing\\Code.exe",
        command: "code",
        windowsCommandAppNames: ["Code.exe"],
      }),
    ).toBe(appPath);
  });

  it("Windows handles missing where.exe without throwing while detecting gui editors", async () => {
    const { resolveEditorDefAppPath } = await importEditorsWithWindowsCommandMocks(
      [],
      "",
      Object.assign(new Error("spawn where.exe ENOENT"), { code: "ENOENT" }),
    );

    expect(() =>
      resolveEditorDefAppPath({
        id: "vscode",
        name: "VS Code",
        appPath: "C:\\missing\\Code.exe",
        command: "code",
        windowsCommandAppNames: ["Code.exe"],
      }),
    ).not.toThrow();
  });
});

describe("file application detection cache", () => {
  it.each(["missing", "icon", "error"])(
    "retries %s results without restarting and shares pending detection",
    async (failure) => {
      setProcessPlatform("linux");
      const resolveFileApplicationPath = vi.fn();
      vi.doMock("../src/main/fileApplications.js", () => ({
        getFileApplicationDefs: () => [{ id: "reader", name: "Reader" }],
        matchesFileApplication: () => true,
        resolveFileApplicationPath,
      }));
      const { app } = await import("electron");
      vi.mocked(app.getFileIcon).mockResolvedValue({ toPNG: () => Buffer.from("icon") } as never);
      if (failure === "missing") resolveFileApplicationPath.mockResolvedValueOnce(null);
      else if (failure === "error")
        resolveFileApplicationPath.mockRejectedValueOnce(new Error("detection failed"));
      else {
        resolveFileApplicationPath.mockResolvedValueOnce("/usr/bin/reader");
        vi.mocked(app.getFileIcon).mockImplementation(async (path) => {
          if (path === "/usr/bin/reader") throw new Error("icon unavailable");
          return { toPNG: () => Buffer.from("icon") } as never;
        });
      }
      const { getInstalledEditors } = await import("../src/main/editors.js");
      if (failure === "error")
        await expect(getInstalledEditors("/work/a.pdf")).rejects.toThrow("detection failed");
      else
        expect(await getInstalledEditors("/work/a.pdf")).not.toEqual(
          expect.arrayContaining([expect.objectContaining({ id: "reader" })]),
        );
      resolveFileApplicationPath.mockResolvedValue("/usr/bin/reader");
      vi.mocked(app.getFileIcon).mockResolvedValue({ toPNG: () => Buffer.from("icon") } as never);
      const results = await Promise.all([
        getInstalledEditors("/work/a.pdf"),
        getInstalledEditors("/work/b.pdf"),
      ]);
      for (const result of results)
        expect(result).toEqual(expect.arrayContaining([expect.objectContaining({ id: "reader" })]));
      expect(resolveFileApplicationPath).toHaveBeenCalledTimes(2);
      await getInstalledEditors("/work/c.pdf");
      expect(resolveFileApplicationPath).toHaveBeenCalledTimes(2);
    },
  );
});
