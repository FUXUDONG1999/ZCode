import { describe, expect, it, vi } from "vitest";
import enUS from "@/i18n/locales/en-US.js";
import zhCN from "@/i18n/locales/zh-CN.js";
import {
  createQuickPickCommands,
  QUICK_PICK_SECTION_ORDER,
} from "@/quickpick/quickPickCommands.js";

function createHandlers() {
  return {
    createTask: vi.fn(),
    openWorkspace: vi.fn(),
    openSettings: vi.fn(),
    openSkillsSettings: vi.fn(),
    openMcpSettings: vi.fn(),
    switchTheme: vi.fn(),
    openFeedback: vi.fn(),
    openCommunity: vi.fn(),
    openProductDocs: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    toggleSidebar: vi.fn(),
    toggleTerminal: vi.fn(),
  };
}

const shortcuts = {
  newTask: "⌘ N",
  openWorkspace: "⌘ O",
  toggleSidebar: "⌘ B",
  toggleTerminal: "⌘ J",
};

describe("createQuickPickCommands", () => {
  it("通用模式过滤终端命令；侧面板命令随面板移除始终不存在", () => {
    const commands = createQuickPickCommands({
      allowOpenWorkspace: true,
      canOpenCommunity: true,
      isSidebarVisible: true,
      isLoggedIn: false,
      supportsTerminal: false,
      themeTarget: "dark",
      shortcuts,
      handlers: createHandlers(),
    });
    const ids = commands.map((command) => command.id);
    expect(ids).not.toContain("toggle-terminal");
    expect(ids).not.toContain("add-terminal-tab");
    expect(ids).not.toContain("add-review-tab");
    // 个人定制：左侧标签式侧面板已移除，面板类命令不再注册。
    expect(ids).not.toContain("toggle-preview");
    expect(ids).not.toContain("add-browser-tab");
    expect(ids).toContain("new-task");
    expect(ids).toContain("settings");
  });

  it("creates the starter command registry in stable sections", () => {
    const commands = createQuickPickCommands({
      allowOpenWorkspace: true,
      canOpenCommunity: true,
      isSidebarVisible: true,
      isLoggedIn: false,
      themeTarget: "dark",
      shortcuts,
      handlers: createHandlers(),
    });

    expect(commands.map((command) => command.id)).toEqual([
      "new-task",
      "open-workspace",
      "suggested-settings",
      "toggle-sidebar",
      "toggle-terminal",
      "settings",
      "switch-theme",
      "skills-settings",
      "mcp-settings",
      "feedback",
      "community",
      "product-docs",
      "login",
    ]);
    expect(commands.find((command) => command.id === "open-workspace")).toMatchObject({
      sectionId: "suggested",
      shortcut: "⌘ O",
      disabled: false,
    });
    expect(commands.find((command) => command.id === "new-task")).toMatchObject({
      sectionId: "suggested",
    });
    expect(commands.find((command) => command.id === "suggested-settings")).toMatchObject({
      sectionId: "suggested",
    });
    expect(commands.find((command) => command.id === "settings")).toMatchObject({
      sectionId: "configure",
    });
    expect(commands.find((command) => command.id === "switch-theme")).toMatchObject({
      sectionId: "configure",
      titleId: "quickPick.command.switchThemeToDark",
      icon: "themeDark",
    });
    expect(commands.find((command) => command.id === "skills-settings")).toMatchObject({
      sectionId: "configure",
    });
    expect(commands.find((command) => command.id === "mcp-settings")).toMatchObject({
      sectionId: "configure",
    });
    expect(commands.find((command) => command.id === "toggle-sidebar")).toMatchObject({
      sectionId: "panels",
      shortcut: "⌘ B",
      icon: "sidebarClose",
    });
    expect(commands.find((command) => command.id === "toggle-terminal")).toMatchObject({
      sectionId: "panels",
    });
    expect(commands.find((command) => command.id === "product-docs")).toMatchObject({
      sectionId: "app",
    });
  });

  it("keeps unavailable workspace opening visible but disabled", () => {
    const commands = createQuickPickCommands({
      allowOpenWorkspace: false,
      canOpenCommunity: true,
      isSidebarVisible: true,
      isLoggedIn: false,
      themeTarget: "dark",
      shortcuts,
      handlers: createHandlers(),
    });

    expect(commands.find((command) => command.id === "open-workspace")).toMatchObject({
      disabled: true,
    });
  });

  it("matches the sidebar toggle icon to the current sidebar state", () => {
    const closedSidebarCommands = createQuickPickCommands({
      allowOpenWorkspace: true,
      canOpenCommunity: true,
      isSidebarVisible: false,
      isLoggedIn: false,
      themeTarget: "dark",
      shortcuts,
      handlers: createHandlers(),
    });

    expect(closedSidebarCommands.find((command) => command.id === "toggle-sidebar")).toMatchObject({
      icon: "sidebarOpen",
    });
  });

  it("个人定制：不再注册任何打开侧面板的命令", () => {
    const commands = createQuickPickCommands({
      allowOpenWorkspace: true,
      canOpenCommunity: true,
      isSidebarVisible: true,
      isLoggedIn: false,
      themeTarget: "dark",
      shortcuts,
      handlers: createHandlers(),
    });

    expect(commands.map((command) => command.id)).not.toContain("toggle-preview");
    expect(commands.map((command) => command.id)).not.toContain("add-browser-tab");
  });

  it("runs the registered panel handler", () => {
    const handlers = createHandlers();
    const command = createQuickPickCommands({
      allowOpenWorkspace: true,
      canOpenCommunity: true,
      isSidebarVisible: true,
      isLoggedIn: false,
      themeTarget: "dark",
      shortcuts,
      handlers,
    }).find((item) => item.id === "toggle-terminal");

    command?.run();

    expect(handlers.toggleTerminal).toHaveBeenCalledTimes(1);
  });

  it("runs configure and app handlers", () => {
    const handlers = createHandlers();
    const commands = createQuickPickCommands({
      allowOpenWorkspace: true,
      canOpenCommunity: true,
      isSidebarVisible: true,
      isLoggedIn: false,
      themeTarget: "dark",
      shortcuts,
      handlers,
    });

    commands.find((item) => item.id === "skills-settings")?.run();
    commands.find((item) => item.id === "product-docs")?.run();

    expect(handlers.openSkillsSettings).toHaveBeenCalledTimes(1);
    expect(handlers.openProductDocs).toHaveBeenCalledTimes(1);
  });

  it("has locale messages for every visible command label", () => {
    const commands = createQuickPickCommands({
      allowOpenWorkspace: true,
      canOpenCommunity: true,
      isSidebarVisible: true,
      isLoggedIn: false,
      themeTarget: "light",
      shortcuts,
      handlers: createHandlers(),
    });
    expect(commands.find((command) => command.id === "switch-theme")).toMatchObject({
      titleId: "quickPick.command.switchThemeToLight",
      icon: "themeLight",
    });
    const messageIds = new Set([
      "quickPick.title",
      "quickPick.description",
      "quickPick.placeholder",
      "quickPick.empty",
      "quickPick.commandFailed",
      "commandCenter.scopeTabs",
      "commandCenter.scope.all",
      "commandCenter.scope.commands",
      "commandCenter.scope.conversations",
      "commandCenter.scope.files",
      "commandCenter.section.recentChanges",
      "commandCenter.section.recentTasks",
      "commandCenter.empty.recentChanges",
      "commandCenter.empty.recentTasks",
      ...commands.map((command) => command.titleId),
      ...QUICK_PICK_SECTION_ORDER.map((sectionId) => `quickPick.section.${sectionId}`),
    ]);

    for (const id of messageIds) {
      expect(zhCN[id], `zh-CN missing ${id}`).toBeTruthy();
      expect(enUS[id], `en-US missing ${id}`).toBeTruthy();
    }
  });

  it("uses logout instead of login for authenticated users", () => {
    const commands = createQuickPickCommands({
      allowOpenWorkspace: true,
      canOpenCommunity: false,
      isSidebarVisible: true,
      isLoggedIn: true,
      themeTarget: "dark",
      shortcuts,
      handlers: createHandlers(),
    });

    expect(commands.some((command) => command.id === "login")).toBe(false);
    expect(commands.find((command) => command.id === "logout")).toMatchObject({
      sectionId: "app",
      titleId: "quickPick.command.logout",
    });
    expect(commands.some((command) => command.id === "community")).toBe(false);
  });
});
