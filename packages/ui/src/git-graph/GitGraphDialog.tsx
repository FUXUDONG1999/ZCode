import { useCallback, useEffect, useRef, useState } from "react";
import type { GitCommitGraphCommit, GitCommitGraphRequest, GitIdentity } from "@zcode/shared";
import { Button } from "@/components/ui/button.js";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.js";
import { toast } from "@/components/ui/toast.js";
import { GitGraphPane, type GitGraphFilterControls } from "@/git-graph/GitGraphPane.js";
import { useServices } from "@/hooks/useServices.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { getErrorMessage } from "@/lib/errorMessage.js";
import { logger } from "@/logger.js";
import { AlertCircleIcon, XIcon } from "lucide-react";

interface GitGraphDialogProps {
  open: boolean;
  workspacePath: string;
  onOpenChange: (nextOpen: boolean) => void;
}

/** 个人定制：筛选栏的输入草稿；生效值另存，文本输入防抖后才提交。 */
interface GitGraphFilterDraft {
  author: string;
  mineOnly: boolean;
  path: string;
}

type GitGraphAppliedFilter = Pick<GitCommitGraphRequest, "author" | "path">;

const GIT_GRAPH_PAGE_SIZE = 50;
const GIT_GRAPH_FILTER_DEBOUNCE_MS = 300;
const EMPTY_FILTER_DRAFT: GitGraphFilterDraft = { author: "", mineOnly: false, path: "" };
const NO_FILTER: GitGraphAppliedFilter = {};

function isSameGraphFilter(left: GitGraphAppliedFilter, right: GitGraphAppliedFilter): boolean {
  return left.author === right.author && left.path === right.path;
}

export function GitGraphDialog({ open, workspacePath, onOpenChange }: GitGraphDialogProps) {
  const { gitService } = useServices();
  const { intl } = useZCodeIntl();
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [commits, setCommits] = useState<GitCommitGraphCommit[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [selectedCommitHash, setSelectedCommitHash] = useState<string | null>(null);
  // 个人定制：筛选是弹窗的本地状态，关闭即丢弃。
  const [filterDraft, setFilterDraft] = useState<GitGraphFilterDraft>(EMPTY_FILTER_DRAFT);
  const [appliedFilter, setAppliedFilter] = useState<GitGraphAppliedFilter>(NO_FILTER);
  const [identity, setIdentity] = useState<GitIdentity | null>(null);
  const loadingMoreRef = useRef(false);
  // 关闭/重开后旧请求仍可能返回；统一使加载、刷新和分页的结果及错误失效。
  const requestGenerationRef = useRef(0);

  const resetGraphState = useCallback(() => {
    requestGenerationRef.current += 1;
    setLoading(false);
    setLoadingMore(false);
    setRefreshing(false);
    loadingMoreRef.current = false;
    setErrorMessage(null);
  }, []);

  const loadInitialCommits = useCallback(async () => {
    const generation = ++requestGenerationRef.current;
    setLoading(true);
    setLoadingMore(false);
    setRefreshing(false);
    loadingMoreRef.current = false;
    setErrorMessage(null);
    setCommits([]);
    setHasMore(false);
    setSelectedCommitHash(null);

    try {
      const result = await gitService.getCommitGraph({
        workspacePath,
        maxCount: GIT_GRAPH_PAGE_SIZE,
        skip: 0,
        ...appliedFilter,
      });
      if (generation !== requestGenerationRef.current) return;
      setCommits(result.commits);
      setHasMore(result.hasMore);
      setSelectedCommitHash(result.commits[0]?.hash ?? null);
    } catch (error: unknown) {
      if (generation !== requestGenerationRef.current) return;
      const message = getErrorMessage(error);
      logger.warn("[GitGraphDialog] 读取 Git Graph 失败", {
        workspacePath,
        error: message,
      });
      setErrorMessage(
        intl.formatMessage({ id: "gitGraph.error.requestFailed" }, { error: message }),
      );
    } finally {
      if (generation === requestGenerationRef.current) setLoading(false);
    }
  }, [appliedFilter, gitService, intl, workspacePath]);

  useEffect(() => {
    if (!open) {
      return;
    }

    void loadInitialCommits();
    return () => {
      requestGenerationRef.current += 1;
    };
  }, [loadInitialCommits, open]);

  const refreshCommits = useCallback(async () => {
    if (loading || loadingMore || refreshing) {
      return;
    }

    const generation = requestGenerationRef.current;
    setRefreshing(true);
    setErrorMessage(null);

    try {
      const result = await gitService.getCommitGraph({
        workspacePath,
        maxCount: GIT_GRAPH_PAGE_SIZE,
        skip: 0,
        ...appliedFilter,
      });
      if (generation !== requestGenerationRef.current) return;
      setCommits(result.commits);
      setHasMore(result.hasMore);
      setSelectedCommitHash(result.commits[0]?.hash ?? null);
    } catch (error: unknown) {
      if (generation !== requestGenerationRef.current) return;
      const message = getErrorMessage(error);
      logger.warn("[GitGraphDialog] 刷新 Git Graph 失败", {
        workspacePath,
        error: message,
      });
      toast(intl.formatMessage({ id: "gitGraph.refreshFailed" }, { error: message }));
    } finally {
      if (generation === requestGenerationRef.current) setRefreshing(false);
    }
  }, [appliedFilter, gitService, intl, loading, loadingMore, refreshing, workspacePath]);

  const loadMoreCommits = useCallback(async () => {
    if (loading || loadingMore || refreshing || loadingMoreRef.current || !hasMore) {
      return;
    }

    const generation = requestGenerationRef.current;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setErrorMessage(null);

    try {
      const result = await gitService.getCommitGraph({
        workspacePath,
        maxCount: GIT_GRAPH_PAGE_SIZE,
        skip: commits.length,
        ...appliedFilter,
      });
      if (generation !== requestGenerationRef.current) return;
      setCommits((currentCommits) => [...currentCommits, ...result.commits]);
      setHasMore(result.hasMore);
    } catch (error: unknown) {
      if (generation !== requestGenerationRef.current) return;
      const message = getErrorMessage(error);
      logger.warn("[GitGraphDialog] 读取更多 Git Graph 失败", {
        workspacePath,
        loadedCommitCount: commits.length,
        error: message,
      });
      setErrorMessage(
        intl.formatMessage({ id: "gitGraph.error.requestFailed" }, { error: message }),
      );
    } finally {
      if (generation === requestGenerationRef.current) {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    }
  }, [
    appliedFilter,
    commits.length,
    gitService,
    hasMore,
    intl,
    loading,
    loadingMore,
    refreshing,
    workspacePath,
  ]);

  // 「只看我的」按仓库身份匹配作者：优先 user.email，没有邮箱时退回 user.name。
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setIdentity(null);

    gitService
      .getIdentity({ workspacePath })
      .then((result) => {
        if (!cancelled) setIdentity(result);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        logger.warn("[GitGraphDialog] 读取 Git 身份失败", {
          workspacePath,
          error: getErrorMessage(error),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [gitService, open, workspacePath]);

  const mineIdentity = identity?.userEmail || identity?.userName || null;

  const applyFilter = useCallback(
    (draft: GitGraphFilterDraft) => {
      const author = draft.mineOnly ? mineIdentity : draft.author.trim();
      const next: GitGraphAppliedFilter = {
        author: author || undefined,
        path: draft.path.trim() || undefined,
      };
      // 值没变时保留同一个对象，否则会触发整表重载。
      setAppliedFilter((current) => (isSameGraphFilter(current, next) ? current : next));
    },
    [mineIdentity],
  );

  // 文本输入防抖后才生效；回车、开关和清除直接调 applyFilter 立即生效。
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => applyFilter(filterDraft), GIT_GRAPH_FILTER_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [applyFilter, filterDraft, open]);

  const updateFilterDraft = (patch: Partial<GitGraphFilterDraft>) =>
    setFilterDraft((current) => ({ ...current, ...patch }));
  const filterActive = Boolean(appliedFilter.author || appliedFilter.path);
  const filterControls: GitGraphFilterControls = {
    author: filterDraft.author,
    onAuthorChange: (author) => updateFilterDraft({ author }),
    onAuthorSubmit: () => applyFilter(filterDraft),
    mineOnly: filterDraft.mineOnly,
    onMineOnlyChange: (mineOnly) => {
      updateFilterDraft({ mineOnly });
      applyFilter({ ...filterDraft, mineOnly });
    },
    mineOnlyDisabled: !mineIdentity,
    path: filterDraft.path,
    onPathChange: (path) => updateFilterDraft({ path }),
    onPathSubmit: () => applyFilter(filterDraft),
    onClear: () => {
      setFilterDraft(EMPTY_FILTER_DRAFT);
      setAppliedFilter(NO_FILTER);
    },
    clearDisabled:
      !filterActive &&
      !filterDraft.author.trim() &&
      !filterDraft.path.trim() &&
      !filterDraft.mineOnly,
  };
  const requestError = errorMessage ? (
    <div className="max-w-md rounded-xl border border-border bg-card p-4 text-ui-base text-foreground">
      <div className="flex items-start gap-3">
        <AlertCircleIcon className="mt-0.5 size-4 shrink-0 text-warning" />
        <p className="break-words text-foreground-subtle">{errorMessage}</p>
      </div>
    </div>
  ) : undefined;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          resetGraphState();
          setFilterDraft(EMPTY_FILTER_DRAFT);
          setAppliedFilter(NO_FILTER);
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="h-[min(78vh,720px)] max-w-5xl gap-0 overflow-hidden rounded-2xl p-0"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{intl.formatMessage({ id: "gitGraph.title" })}</DialogTitle>
          <DialogDescription>
            {intl.formatMessage({ id: "gitGraph.dialogDescription" })}
          </DialogDescription>
        </DialogHeader>
        <DialogClose asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={intl.formatMessage({ id: "common.close" })}
            className="absolute right-2 top-2 z-30 bg-background/80 text-foreground-subtle hover:bg-hover hover:text-foreground [app-region:no-drag]"
          >
            <XIcon className="size-3.5" />
          </Button>
        </DialogClose>
        <GitGraphPane
          commits={commits}
          hasMore={hasMore}
          loading={loading}
          loadingMore={loadingMore}
          refreshing={refreshing}
          error={requestError}
          filterActive={filterActive}
          filter={filterControls}
          selectedCommitHash={selectedCommitHash}
          onSelectCommit={setSelectedCommitHash}
          onLoadMore={loadMoreCommits}
          onRefresh={refreshCommits}
        />
      </DialogContent>
    </Dialog>
  );
}
