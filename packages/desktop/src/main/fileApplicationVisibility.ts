import { getEditorDefsForCurrentPlatform, resolveEditorDefAppPath } from "./editors.js";
import { normalizeApplicationKey } from "./file-open-apps/index.js";
import type { NativeFileApplication } from "./file-open-apps/contract.js";

// 个人定制的移除清单（MYAGENT-FEATURES #30）：这些应用不再出现在文件打开方式里。
// 注意：正式版 Google Chrome 不在清单内——它在 UI 层按显示名固定为第三收藏入口；
// 这里只屏蔽 Chromium 内核的测试/社区变体。Ghostty 等第三方终端不受影响。
const REMOVED_DARWIN_BUNDLE_IDENTITIES = new Set([
  "darwin-bundle:com.apple.quicktimeplayerx",
  "darwin-bundle:com.apple.textedit",
  "darwin-bundle:com.apple.iwork.numbers",
  "darwin-bundle:com.apple.dt.xcode",
  "darwin-bundle:com.apple.notes",
  "darwin-bundle:com.apple.terminal",
  "darwin-bundle:com.google.chrome.for_testing",
  "darwin-bundle:org.chromium.chromium",
]);

// Windows/Linux 侧按可执行路径或 desktop entry 匹配 Chromium 测试/社区变体。
const REMOVED_APPLICATION_KEY_MARKERS = [
  "\\chrome for testing\\application\\chrome.exe",
  "\\chromium\\application\\chrome.exe",
];

const REMOVED_LINUX_DESKTOP_IDENTITIES = new Set([
  "linux-desktop:chromium.desktop",
  "linux-desktop:chromium-browser.desktop",
]);

function isRemovedByUserList(application: NativeFileApplication): boolean {
  const identity = application.identity?.trim().toLowerCase();
  if (identity) {
    if (REMOVED_DARWIN_BUNDLE_IDENTITIES.has(identity)) return true;
    if (REMOVED_LINUX_DESKTOP_IDENTITIES.has(identity)) return true;
  }
  const key = normalizeApplicationKey(application.key);
  return REMOVED_APPLICATION_KEY_MARKERS.some((marker) => key.includes(marker));
}

let editorApplicationPathKeys: Set<string> | null = null;

function resolveEditorApplicationPathKeys(): Set<string> {
  if (editorApplicationPathKeys) return editorApplicationPathKeys;
  const keys = new Set<string>();
  for (const definition of getEditorDefsForCurrentPlatform()) {
    // fileExtensions 定义（Word/Excel 等）服务按扩展名匹配的场景，不参与影子去重。
    if ("fileExtensions" in definition) continue;
    const appPath = resolveEditorDefAppPath(definition);
    if (appPath) keys.add(normalizeApplicationKey(appPath));
  }
  editorApplicationPathKeys = keys;
  return keys;
}

/**
 * 文件打开方式列表的可见性过滤：命中个人移除清单，或与已安装编辑器白名单
 * 指向同一应用路径（UI 会追加编辑器固定入口，保留系统条目会出现重复）时排除。
 */
export function createFileApplicationExclusionFilter(): (
  application: NativeFileApplication,
) => boolean {
  return (application) =>
    isRemovedByUserList(application) ||
    resolveEditorApplicationPathKeys().has(normalizeApplicationKey(application.key));
}
