import type { ComponentProps } from "react";
import { FolderOpenIcon } from "lucide-react";
import { PreviewPane } from "@/PreviewPane.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import type { CodeViewerSource } from "@/lib/codeViewer.js";

type FileManagerPaneProps = Omit<ComponentProps<typeof PreviewPane>, "source"> & {
  source: CodeViewerSource | null;
};

// 个人定制（v2 适配版）：侧面板任务文件预览只展示文件内容，不再带左侧目录树。
// 上游的 workspace-file-tree UI 家族与 WorkspaceFileTree.tsx（树+内容）保持原样保留，
// 供上游主工作区功能继续使用；本组件仅服务侧面板预览场景。
export function FileManagerPane({ source, ...previewProps }: FileManagerPaneProps) {
  const { intl } = useZCodeIntl();

  return source ? (
    <PreviewPane {...previewProps} source={source} />
  ) : (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-ui-base text-foreground-subtle">
      <FolderOpenIcon className="size-6" />
      <span>{intl.formatMessage({ id: "fileManager.empty" })}</span>
    </div>
  );
}
