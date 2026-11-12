import { Folder } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import type { GitRepositorySummary } from "@zcode/shared";
import { GitBranchSwitcher } from "@/GitBranchSwitcher.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useBaseWorkspaceServices } from "@/hooks/useWorkspaceServices.js";
import { useGitAutoRefresh } from "@/hooks/useGitAutoRefresh.js";
import { ServiceProvider } from "@/hooks/useServices.js";
import { getPathLeaf } from "@/lib/path.js";
import type {
  ProjectRoot,
  VirtualProject,
} from "@/project-sidebar/contract.js";

/**
 * 项目展开区的文件夹行：每个 root 一行，显示目录名，git root 追加分支切换入口。
 * 文件夹是操作层不是任务导航层（虚拟项目 spec A2），任务仍整组归属项目。
 */
export function ProjectFolderRows({
  project,
  expanded,
}: {
  project: VirtualProject;
  expanded: boolean;
}) {
  const baseServices = useBaseWorkspaceServices();
  const sortedRoots = useMemo(
    () => sortProjectRoots(project.roots),
    [project.roots],
  );
  if (project.hostId !== "local" || sortedRoots.length === 0) return null;
  // GitBranchSwitcher 内部走 useServices()（跟随激活 tab）；远端 tab 激活时必须钉住
  // 本机 base services，否则本地 root 的 git 调用会被路由到远端 host。
  return (
    <ServiceProvider services={baseServices}>
      <div className="pb-1" data-testid="project-folder-rows">
        {sortedRoots.map((root) => (
          <ProjectFolderRow
            key={root.rootPath}
            root={root}
            expanded={expanded}
          />
        ))}
      </div>
    </ServiceProvider>
  );
}

function sortProjectRoots(roots: ProjectRoot[]): ProjectRoot[] {
  return [...roots].sort((left, right) => {
    if (left.isPrimary !== right.isPrimary) return left.isPrimary ? -1 : 1;
    return left.position - right.position;
  });
}

const ProjectFolderRow = memo(function ProjectFolderRow({
  root,
  expanded,
}: {
  root: ProjectRoot;
  expanded: boolean;
}) {
  const { intl } = useZCodeIntl();
  const { summary, refresh } = useFolderGitSummary(root.rootPath, expanded);
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
      {summary?.isRepository ? (
        <ProjectFolderBranch rootPath={root.rootPath} summary={summary} expanded={expanded} refresh={refresh} />
      ) : null}
    </div>
  );
});

/** 展开期间监听仓库变更自动刷新分支；仅在确认是 git 仓库后挂载，watcher 随收起/卸载拆除。 */
function ProjectFolderBranch({
  rootPath,
  summary,
  expanded,
  refresh,
}: {
  rootPath: string;
  summary: GitRepositorySummary;
  expanded: boolean;
  refresh(): void;
}) {
  useGitAutoRefresh({
    workspacePath: rootPath,
    workspaceIdentity: undefined,
    remoteSessionId: null,
    gitSummary: summary,
    gitSummaryWorkspaceKey: summary.workspacePath,
    enabled: expanded && summary.isRepository,
    onRefreshGit: refresh,
  });
  return (
    // 不传 compactForRemoteControl：该语义为聊天栏窄底设计（只留图标），侧栏行需要分支名可见。
    <span data-testid="project-folder-branch" className="ml-auto shrink-0">
      <GitBranchSwitcher
        workspacePath={rootPath}
        gitSummary={summary}
        dirtyFileCount={0}
        onRefreshGit={refresh}
        popoverSide="right"
        className="px-0 pt-0"
        triggerClassName="h-6 gap-1 rounded-full px-2 text-ui-sm text-foreground-subtle max-w-40"
      />
    </span>
  );
}

/** 展开（enabled）时按 rootPath 拉取仓库摘要；失败静默为 null，行退化为纯目录名。 */
function useFolderGitSummary(rootPath: string, enabled: boolean) {
  const { gitService } = useBaseWorkspaceServices();
  const [summary, setSummary] = useState<GitRepositorySummary | null>(null);
  const [refreshSequence, setRefreshSequence] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    void gitService.getRepositorySummary({ workspacePath: rootPath }).then(
      (next) => {
        if (!disposed) setSummary(next);
      },
      () => {
        if (!disposed) setSummary(null);
      },
    );
    return () => {
      disposed = true;
    };
  }, [enabled, gitService, rootPath, refreshSequence]);
  const refresh = useCallback(
    () => setRefreshSequence((sequence) => sequence + 1),
    [],
  );
  return { summary, refresh };
}
