import type { ComponentProps } from "react";
import { FolderOpenIcon } from "lucide-react";
import { PreviewPane } from "@/PreviewPane.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import type { CodeViewerSource } from "@/lib/codeViewer.js";

type FileManagerPaneProps = Omit<ComponentProps<typeof PreviewPane>, "source"> & {
    source: CodeViewerSource | null;
};

// 个人定制：任务文件预览只展示文件内容。原左侧目录树与显隐切换、可拖分栏已按需移除，
// 需要目录树时从 git 历史（f5a8d8b3 之前）恢复 workspace-file-tree UI 家族。
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
