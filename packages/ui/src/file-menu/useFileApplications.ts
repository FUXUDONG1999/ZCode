import { useCallback, useEffect, useRef, useState } from "react";
import type { FileApplicationInfo, FileApplicationTarget } from "@zcode/shared";
import { usePlatform } from "@/hooks/usePlatform.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { toast } from "@/components/ui/toast.js";
import { logger } from "@/logger.js";

/** origin 标记打开通道：editor 走 openInEditor，缺省走系统关联 openFileWithApplication。 */
export type OpenWithApplicationChoice = Omit<FileApplicationInfo, "isDefault"> & {
  isDefault?: boolean;
  origin?: "editor";
};

interface UseFileApplicationsOptions {
  /** 本地文件时把已安装的编辑器白名单（Sublime/VS Code 等）并入打开方式列表。 */
  includeInstalledEditors?: boolean;
}

// 个人定制（MYAGENT-FEATURES #30）：固定收藏顺序 Sublime Text → Google Chrome，
// 收藏顺序优先于系统默认置顶。Chrome 来自系统关联，按显示名精确匹配，不进编辑器白名单。
const PINNED_OPEN_WITH_EDITOR_IDS = ["sublime"] as const;
const PINNED_OPEN_WITH_APPLICATION_NAMES = ["Google Chrome"] as const;

// 系统文件管理器不进打开方式列表：菜单已固定提供「在 Finder/资源管理器中打开」定位项，列出会重复。
const EXCLUDED_OPEN_WITH_EDITOR_IDS = ["finder", "explorer"] as const;

function orderEditorChoicesForOpenWith(choices: OpenWithApplicationChoice[]) {
  const visible = choices.filter(
    (choice) => !(EXCLUDED_OPEN_WITH_EDITOR_IDS as readonly string[]).includes(choice.id),
  );
  const pinnedRank = (id: string) =>
    PINNED_OPEN_WITH_EDITOR_IDS.indexOf(id as (typeof PINNED_OPEN_WITH_EDITOR_IDS)[number]);
  const pinned = visible.filter((choice) => pinnedRank(choice.id) !== -1);
  const rest = visible.filter((choice) => pinnedRank(choice.id) === -1);
  pinned.sort((left, right) => pinnedRank(left.id) - pinnedRank(right.id));
  return { pinned, rest };
}

function composeOpenWithApplications(
  editorChoices: OpenWithApplicationChoice[],
  systemApps: FileApplicationInfo[],
  mergeEnabled: boolean,
): OpenWithApplicationChoice[] {
  if (!mergeEnabled) return systemApps;
  const { pinned: pinnedEditors, rest: otherEditors } =
    orderEditorChoicesForOpenWith(editorChoices);
  const pinnedSystem = systemApps.filter((application) =>
    (PINNED_OPEN_WITH_APPLICATION_NAMES as readonly string[]).includes(application.name),
  );
  const otherSystem = systemApps.filter(
    (application) =>
      !(PINNED_OPEN_WITH_APPLICATION_NAMES as readonly string[]).includes(application.name),
  );
  // 合并开启后收藏顺序占据前几个直显位，直显列表不再重复标记默认应用；
  // 默认应用仍由主按钮图标/提示与中性默认入口承载（defaultApplication 不受影响）。
  const withoutDefaultMark = (application: FileApplicationInfo): OpenWithApplicationChoice => {
    const { isDefault: _isDefault, ...rest } = application;
    return rest;
  };
  return [
    ...pinnedEditors,
    ...pinnedSystem.map(withoutDefaultMark),
    ...otherEditors,
    ...otherSystem.map(withoutDefaultMark),
  ];
}

export function useFileApplications(
  target: FileApplicationTarget | null,
  isRemote = false,
  options: UseFileApplicationsOptions = {},
) {
  const platform = usePlatform();
  const { intl } = useZCodeIntl();
  const key = target ? `${target.path}\u0000${target.workspaceIdentity ?? ""}` : "";
  const targetRef = useRef(target);
  targetRef.current = target;
  const platformRef = useRef(platform);
  platformRef.current = platform;
  const getFileApplications = platform.getFileApplications;
  const currentKey = useRef(key);
  currentKey.current = key;
  const request = useRef(0);
  const [state, setState] = useState<{
    key: string;
    apps: FileApplicationInfo[];
    loading: boolean;
  }>({
    key: "",
    apps: [],
    loading: false,
  });
  const [editorChoices, setEditorChoices] = useState<OpenWithApplicationChoice[]>([]);
  const editorChoicesLoaded = useRef(false);
  const available = Boolean(
    target?.pathKind === "file" &&
    !isRemote &&
    platform.canOpenLocalFiles &&
    platform.getFileApplications &&
    platform.openFileWithApplication,
  );
  const editorsAvailable = Boolean(options.includeInstalledEditors && available);
  useEffect(
    () => () => {
      request.current += 1;
    },
    [key, available],
  );
  const load = useCallback(async () => {
    const currentTarget = targetRef.current;
    if (!available || !currentTarget || !getFileApplications) return;
    const id = ++request.current;
    setState({ key, apps: [], loading: true });
    try {
      // 编辑器白名单与文件类型无关，只加载一次；系统关联随目标重查。
      const loadEditors =
        editorsAvailable && !editorChoicesLoaded.current
          ? platformRef.current.getInstalledEditors?.().then(
              (editors) => {
                editorChoicesLoaded.current = true;
                setEditorChoices(
                  editors.map(
                    (editor): OpenWithApplicationChoice => ({
                      ...editor,
                      iconDataUrl: editor.iconDataUrl ?? "",
                      isDefault: false,
                      origin: "editor",
                    }),
                  ),
                );
              },
              (error: unknown) => {
                logger.warn("[FileApplications] 获取已安装编辑器失败", { error: String(error) });
              },
            )
          : undefined;
      const apps = await getFileApplications(currentTarget);
      if (request.current !== id || currentKey.current !== key) return;
      if (loadEditors) await loadEditors;
      setState({
        key,
        apps: [...apps].sort((a, b) => Number(b.isDefault) - Number(a.isDefault)),
        loading: false,
      });
    } catch (error) {
      if (request.current !== id || currentKey.current !== key) return;
      setState({ key, apps: [], loading: false });
      logger.warn("[FileApplications] 获取系统关联应用失败", {
        path: targetRef.current?.path,
        error: String(error),
      });
    }
  }, [available, key, getFileApplications, editorsAvailable]);
  const apps =
    state.key === key && available
      ? composeOpenWithApplications(editorChoices, state.apps, editorsAvailable)
      : [];
  // 编辑器条目 isDefault 恒为 false，默认应用只可能来自系统关联。
  const defaultApplication: FileApplicationInfo | null =
    state.key === key && available ? (state.apps.find((app) => app.isDefault) ?? null) : null;
  const open = useCallback(
    async (application: OpenWithApplicationChoice) => {
      const currentTarget = targetRef.current;
      const currentPlatform = platformRef.current;
      if (!available || !currentTarget) return;
      try {
        if (application.origin === "editor") {
          if (!currentPlatform.openInEditor) throw new Error("open_in_editor_unavailable");
          const result = await currentPlatform.openInEditor(application.id, currentTarget.path, {
            pathKind: "file",
          });
          if (!result.success) throw new Error(result.error || "open_failed");
          return;
        }
        if (!currentPlatform.openFileWithApplication) return;
        const result = await currentPlatform.openFileWithApplication(application.id, currentTarget);
        if (!result.success) throw new Error(result.error || "open_failed");
      } catch (error) {
        logger.warn("[FileApplications] 打开文件失败", {
          path: currentTarget.path,
          applicationId: application.id,
          error: String(error),
        });
        toast(intl.formatMessage({ id: "chat.previewCards.openFileFailed" }));
      }
    },
    [available, intl],
  );
  const openDefault = useCallback(async () => {
    const currentTarget = targetRef.current;
    const currentPlatform = platformRef.current;
    if (
      isRemote ||
      !currentTarget ||
      !currentPlatform.canOpenLocalFiles ||
      !currentPlatform.openExternalFile
    )
      return;
    try {
      const result = await currentPlatform.openExternalFile(currentTarget.path);
      if (!result.success) throw new Error(result.error || "open_failed");
    } catch (error) {
      logger.warn("[FileApplications] 默认应用打开失败", {
        path: currentTarget.path,
        error: String(error),
      });
      toast(intl.formatMessage({ id: "chat.previewCards.openFileFailed" }));
    }
  }, [isRemote, open, intl]);

  return {
    available,
    apps,
    defaultApplication,
    openDefault,
    loading: state.key === key && available && state.loading,
    load,
    open,
  };
}
