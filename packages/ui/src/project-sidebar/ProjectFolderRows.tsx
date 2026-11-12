import { Folder } from "lucide-react";
import { memo, useMemo } from "react";
import type { ProjectRoot } from "@zcode/services";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { getPathLeaf } from "@/lib/path.js";
import type { VirtualProject } from "@/project-sidebar/contract.js";

/**
 * 项目展开区的文件夹行：每个 root 一行，显示目录名，git root 追加分支切换入口。
 * 文件夹是操作层不是任务导航层（虚拟项目 spec A2），任务仍整组归属项目。
 */
export function ProjectFolderRows({ project }: { project: VirtualProject }) {
  const sortedRoots = useMemo(() => sortProjectRoots(project.roots), [project.roots]);
  if (project.hostId !== "local" || sortedRoots.length === 0) return null;
  return (
    <div className="pb-1" data-testid="project-folder-rows">
      {sortedRoots.map((root) => (
        <ProjectFolderRow key={root.rootPath} root={root} />
      ))}
    </div>
  );
}

function sortProjectRoots(roots: ProjectRoot[]): ProjectRoot[] {
  return [...roots].sort((left, right) => {
    if (left.isPrimary !== right.isPrimary) return left.isPrimary ? -1 : 1;
    return left.position - right.position;
  });
}

const ProjectFolderRow = memo(function ProjectFolderRow({ root }: { root: ProjectRoot }) {
  const { intl } = useZCodeIntl();
  const folderName = getPathLeaf(root.rootPath) || root.rootPath;
  const primarySuffix = root.isPrimary
    ? ` · ${intl.formatMessage({ id: "project.folder.primaryRoot" })}`
    : "";
  return (
    <div
      data-testid="project-folder-row"
      data-folder-path={root.rootPath}
      data-primary={root.isPrimary ? "true" : "false"}
      title={`${root.rootPath}${primarySuffix}`}
      className="ml-4 flex h-7 min-w-0 items-center gap-1.5 rounded-lg px-2 text-ui-sm text-foreground-subtle hover:bg-surface-hover"
    >
      <Folder aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="min-w-0 truncate">{folderName}</span>
    </div>
  );
});
