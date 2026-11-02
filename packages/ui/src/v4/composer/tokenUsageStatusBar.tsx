import { useMemo, useState, type ReactNode } from "react";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { cn } from "@/components/lib/utils.js";
import { useTokenUsageStatusStore } from "@/store/tokenUsageStatusStore.js";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card.js";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.js";
import { Checkbox } from "@/components/ui/checkbox.js";
import { SettingsIcon } from "lucide-react";
import type { TokenUsageBreakdown } from "@zcode/shared";

/** 个人定制：composer 卡片内的 token 用量状态条（数据来自主进程 pump，spec：docs/desktop/token-usage-statusbar.md）。 */

const SETTINGS_STORAGE_KEY = "zcode.tokenUsageStatusBar.items";

const ITEM_KEYS = [
  "speed",
  "context",
  "lastTurn",
  "session",
  "tools",
  "today",
  "subagents",
] as const;
type TokenUsageItemKey = (typeof ITEM_KEYS)[number];
type TokenUsageItemVisibility = Record<TokenUsageItemKey, boolean>;

const DEFAULT_VISIBILITY: TokenUsageItemVisibility = {
  speed: true,
  context: true,
  lastTurn: true,
  session: true,
  tools: true,
  today: true,
  subagents: true,
};

function readVisibility(): TokenUsageItemVisibility {
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_VISIBILITY };
    const parsed = JSON.parse(raw) as Partial<TokenUsageItemVisibility>;
    return {
      ...DEFAULT_VISIBILITY,
      ...Object.fromEntries(ITEM_KEYS.map((key) => [key, Boolean(parsed[key])])),
    };
  } catch {
    return { ...DEFAULT_VISIBILITY };
  }
}

function writeVisibility(visibility: TokenUsageItemVisibility) {
  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(visibility));
  } catch {
    // localStorage 不可用时开关仅本次会话生效
  }
}

interface ContextWindowSummary {
  usedTokens: number;
  maxTokens: number;
}

function formatCompact(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(
    value,
  );
}

function formatDuration(milliseconds: number, locale: string): string {
  const seconds = milliseconds / 1000;
  if (seconds < 60)
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const restSeconds = Math.round(seconds % 60);
  return `${minutes}m ${restSeconds}s`;
}

function speedToneClass(tokensPerSecond: number): string {
  if (tokensPerSecond >= 70) return "text-success";
  if (tokensPerSecond >= 40) return "text-warning";
  return "text-destructive";
}

function contextTone(contextWindow: { used: number; max: number }): string {
  if (contextWindow.max <= 0) return "text-foreground-subtle";
  const ratio = contextWindow.used / contextWindow.max;
  // ≥1M 大窗口提前预警（对齐插件 40%/60% 档位），普通窗口 75%/90%
  const warningRatio = contextWindow.max >= 1_000_000 ? 0.4 : 0.75;
  const dangerRatio = contextWindow.max >= 1_000_000 ? 0.6 : 0.9;
  if (ratio >= dangerRatio) return "text-destructive";
  if (ratio >= warningRatio) return "text-warning";
  return "text-foreground-subtle";
}

function DetailRow({ label, value }: { label: ReactNode; value: ReactNode }) {
  // 修复：子代理标题是整段 prompt，长标签不截断会把数值挤到贴边换行并撑破浮层。
  // 标签 min-w-0 truncate 单行省略，数值 shrink-0 不参与压缩。
  return (
    <div className="flex min-w-0 items-center justify-between gap-4">
      <span className="min-w-0 truncate text-foreground-subtlest">{label}</span>
      <span className="shrink-0 whitespace-nowrap tabular-nums text-foreground-subtle">{value}</span>
    </div>
  );
}

function BreakdownRows({ tokens, locale }: { tokens: TokenUsageBreakdown; locale: string }) {
  const { intl } = useZCodeIntl();
  const rows: Array<[string, number]> = [
    ["tokenUsage.breakdown.input", tokens.inputTokens],
    ["tokenUsage.breakdown.output", tokens.outputTokens],
    ["tokenUsage.breakdown.cacheRead", tokens.cacheReadTokens],
    ["tokenUsage.breakdown.cacheWrite", tokens.cacheWriteTokens],
    ["tokenUsage.breakdown.reasoning", tokens.reasoningTokens],
  ];
  return (
    <>
      {rows.map(([id, value]) => (
        <DetailRow
          key={id}
          label={intl.formatMessage({ id })}
          value={formatCompact(value, locale)}
        />
      ))}
      <DetailRow
        label={intl.formatMessage({ id: "tokenUsage.breakdown.total" })}
        value={formatCompact(tokens.totalTokens, locale)}
      />
    </>
  );
}

function UsageChip({
  label,
  value,
  toneClass,
  detail,
  testId,
  contentClassName,
}: {
  label: string;
  value: ReactNode;
  toneClass?: string;
  detail: ReactNode;
  testId: string;
  contentClassName?: string;
}) {
  return (
    <HoverCard openDelay={250} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          data-testid={testId}
          className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-ui-xs tabular-nums transition-colors hover:bg-surface-hover"
        >
          <span className="text-foreground-subtlest">{label}</span>
          <span className={cn("font-medium", toneClass ?? "text-foreground-subtle")}>{value}</span>
        </button>
      </HoverCardTrigger>
      <HoverCardContent
        side="top"
        sideOffset={6}
        className={cn(
          "w-64 rounded-lg border border-border bg-tooltip p-3 text-tooltip-foreground shadow-md",
          contentClassName,
        )}
      >
        <div className="flex flex-col gap-1 text-ui-xs">{detail}</div>
      </HoverCardContent>
    </HoverCard>
  );
}

export function TokenUsageStatusBar({
  sessionId,
  contextWindow,
}: {
  sessionId: string | null;
  contextWindow: ContextWindowSummary | null;
}) {
  const { intl, locale } = useZCodeIntl();
  const snapshot = useTokenUsageStatusStore((state) => state.snapshot);
  const [visibility, setVisibility] = useState<TokenUsageItemVisibility>(readVisibility);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const session = sessionId ? snapshot?.sessions[sessionId] : undefined;
  const today = snapshot?.today;

  const visibleCount = useMemo(
    () => ITEM_KEYS.filter((key) => visibility[key]).length,
    [visibility],
  );
  if (!sessionId || visibleCount === 0) return null;
  // 会话零请求且今日也为零（或尚无任何快照）时不渲染整条
  const hasAnyData =
    (session !== undefined && session.requests > 0) || (today !== undefined && today.requests > 0);
  if (!hasAnyData) return null;

  const toggleItem = (key: TokenUsageItemKey, checked: boolean) => {
    const next = { ...visibility, [key]: checked };
    setVisibility(next);
    writeVisibility(next);
  };

  const averageSpeed = session?.averageTokensPerSecond ?? 0;
  const lastTurn = session?.lastTurn;
  const lastRequest = session?.lastRequest;
  const effectiveContext = (() => {
    if (contextWindow && contextWindow.maxTokens > 0) {
      return { used: contextWindow.usedTokens, max: contextWindow.maxTokens, fromProtocol: true };
    }
    const used = session?.lastRequestInputTokens ?? 0;
    return { used, max: 0, fromProtocol: false };
  })();
  const contextExceeded =
    session?.contextExceededAt !== null &&
    session?.contextExceededAt !== undefined &&
    session.contextExceededAt > (lastRequest?.endedAt ?? 0);

  return (
    <div
      data-testid="token-usage-status-bar"
      className="flex min-w-0 flex-wrap items-center gap-0.5 pt-2 text-ui-xs"
    >
      {visibility.speed && session ? (
        <UsageChip
          testId="token-usage-speed"
          label={intl.formatMessage({ id: "tokenUsage.speed" })}
          value={
            averageSpeed > 0
              ? `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(averageSpeed)} t/s`
              : "—"
          }
          toneClass={averageSpeed > 0 ? speedToneClass(averageSpeed) : undefined}
          detail={
            <>
              <DetailRow
                label={intl.formatMessage({ id: "tokenUsage.speed.sessionAverage" })}
                value={averageSpeed > 0 ? `${averageSpeed} t/s` : "—"}
              />
              <DetailRow
                label={intl.formatMessage({ id: "tokenUsage.speed.lastTurn" })}
                value={lastTurn?.tokensPerSecond ? `${lastTurn.tokensPerSecond} t/s` : "—"}
              />
              <DetailRow
                label={intl.formatMessage({ id: "tokenUsage.speed.lastRequest" })}
                value={lastRequest?.tokensPerSecond ? `${lastRequest.tokensPerSecond} t/s` : "—"}
              />
              {lastRequest ? (
                <DetailRow
                  label={lastRequest.modelId}
                  value={formatDuration(lastRequest.durationMs, locale)}
                />
              ) : null}
            </>
          }
        />
      ) : null}

      {visibility.context && effectiveContext.max > 0 ? (
        <UsageChip
          testId="token-usage-context"
          label={intl.formatMessage({ id: "tokenUsage.context" })}
          value={`${Math.floor((effectiveContext.used / effectiveContext.max) * 100)}%`}
          toneClass={cn(
            contextTone(effectiveContext),
            contextExceeded && "text-destructive animate-pulse",
          )}
          detail={
            <>
              <DetailRow
                label={intl.formatMessage({ id: "tokenUsage.context.used" })}
                value={`${formatCompact(effectiveContext.used, locale)} / ${formatCompact(effectiveContext.max, locale)}`}
              />
              <DetailRow
                label={intl.formatMessage({ id: "tokenUsage.context.source" })}
                value={intl.formatMessage({
                  id: effectiveContext.fromProtocol
                    ? "tokenUsage.context.protocol"
                    : "tokenUsage.context.database",
                })}
              />
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface">
                <div
                  className={cn(
                    "h-full rounded-full",
                    contextTone(effectiveContext) === "text-destructive"
                      ? "bg-destructive"
                      : contextTone(effectiveContext) === "text-warning"
                        ? "bg-warning"
                        : "bg-success",
                  )}
                  style={{
                    width: `${Math.min(100, (effectiveContext.used / effectiveContext.max) * 100)}%`,
                  }}
                />
              </div>
            </>
          }
        />
      ) : null}

      {visibility.lastTurn && lastTurn ? (
        <UsageChip
          testId="token-usage-last-turn"
          label={intl.formatMessage({ id: "tokenUsage.lastTurn" })}
          value={formatCompact(lastTurn.tokens.totalTokens, locale)}
          detail={
            <>
              <BreakdownRows tokens={lastTurn.tokens} locale={locale} />
              <DetailRow
                label={intl.formatMessage({ id: "tokenUsage.duration" })}
                value={lastTurn.durationMs > 0 ? formatDuration(lastTurn.durationMs, locale) : "—"}
              />
              <DetailRow
                label={intl.formatMessage({ id: "tokenUsage.toolCalls" })}
                value={`${lastTurn.toolCalls}${lastTurn.toolErrors > 0 ? ` (+${lastTurn.toolErrors})` : ""}`}
              />
            </>
          }
        />
      ) : null}

      {visibility.session && session && session.requests > 0 ? (
        <UsageChip
          testId="token-usage-session"
          label={intl.formatMessage({ id: "tokenUsage.session" })}
          value={formatCompact(session.tokens.totalTokens, locale)}
          detail={
            <>
              <BreakdownRows tokens={session.tokens} locale={locale} />
              <DetailRow
                label={intl.formatMessage({ id: "tokenUsage.turnsAndRequests" })}
                value={`${session.turns} / ${session.requests}`}
              />
              {session.retries > 0 ? (
                <DetailRow
                  label={intl.formatMessage({ id: "tokenUsage.retries" })}
                  value={session.retries}
                />
              ) : null}
            </>
          }
        />
      ) : null}

      {visibility.tools && session && session.tools.totalCalls > 0 ? (
        <UsageChip
          testId="token-usage-tools"
          label={intl.formatMessage({ id: "tokenUsage.tools" })}
          value={
            session.tools.errorCalls > 0
              ? `${session.tools.totalCalls} +${session.tools.errorCalls}`
              : session.tools.totalCalls
          }
          toneClass={session.tools.errorCalls > 0 ? "text-destructive" : undefined}
          detail={
            <>
              {session.tools.entries.slice(0, 6).map((entry) => (
                <DetailRow
                  key={entry.name}
                  label={entry.name}
                  value={`${entry.calls}${entry.errors > 0 ? ` (+${entry.errors})` : ""}`}
                />
              ))}
            </>
          }
        />
      ) : null}

      {visibility.today && today && today.requests > 0 ? (
        <UsageChip
          testId="token-usage-today"
          label={intl.formatMessage({ id: "tokenUsage.today" })}
          value={formatCompact(today.tokens.totalTokens, locale)}
          detail={
            <>
              <DetailRow
                label={intl.formatMessage({ id: "tokenUsage.requests" })}
                value={today.requests}
              />
              <BreakdownRows tokens={today.tokens} locale={locale} />
            </>
          }
        />
      ) : null}

      {visibility.subagents && session && session.subagents.entries.length > 0 ? (
        <UsageChip
          testId="token-usage-subagents"
          label={intl.formatMessage({ id: "tokenUsage.subagents" })}
          contentClassName="w-80"
          value={
            <>
              {session.subagents.activeCount > 0 ? (
                <span className="size-1.5 rounded-full bg-info" aria-label="running" />
              ) : null}
              {formatCompact(session.subagents.totalTokens, locale)}
            </>
          }
          detail={
            <>
              {session.subagents.entries.map((entry) => (
                <DetailRow
                  key={entry.sessionId}
                  label={
                    <span className="flex min-w-0 items-center gap-1" title={entry.title || entry.agent}>
                      {entry.active ? <span className="size-1 shrink-0 rounded-full bg-info" /> : null}
                      <span className="truncate">{entry.title || entry.agent}</span>
                    </span>
                  }
                  value={formatCompact(entry.totalTokens, locale)}
                />
              ))}
            </>
          }
        />
      ) : null}

      <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={intl.formatMessage({ id: "tokenUsage.settings" })}
            data-testid="token-usage-settings"
            className="ml-auto inline-flex size-5 shrink-0 items-center justify-center rounded-md text-foreground-subtlest transition-colors hover:bg-surface-hover hover:text-foreground-subtle"
          >
            <SettingsIcon className="size-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent side="top" align="end" sideOffset={6} className="w-44 rounded-lg p-2">
          <div className="flex flex-col gap-1">
            {ITEM_KEYS.map((key) => (
              <label
                key={key}
                className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-ui-xs hover:bg-surface-hover"
              >
                <Checkbox
                  checked={visibility[key]}
                  onCheckedChange={(checked) => toggleItem(key, checked === true)}
                />
                {intl.formatMessage({ id: `tokenUsage.item.${key}` })}
              </label>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
