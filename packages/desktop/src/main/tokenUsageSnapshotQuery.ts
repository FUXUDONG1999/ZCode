import type { DatabaseSync } from "node:sqlite";
import {
  EMPTY_TOKEN_USAGE_BREAKDOWN,
  type TokenUsageBreakdown,
  type TokenUsageLastRequest,
  type TokenUsageLastTurn,
  type TokenUsageSessionSnapshot,
  type TokenUsageSubagentEntry,
  type TokenUsageTodaySummary,
  type TokenUsageToolEntry,
  type TokenUsageWindowSnapshot,
} from "@zcode/shared";

/**
 * 个人定制：token 用量状态条的只读查询（口径移植自 zusage.py）。
 * total = input + output；input 已含 cache read、output 已含 reasoning，不再叠加；
 * 只计 status='completed'；速度样本窗 200ms~1h，reasoning 型请求生成窗口用
 * completed_at−started_at（思考不计入首字后的流式窗口），普通请求用 completed_at−first_token_at。
 */

const SPEED_SAMPLE_MIN_GENERATION_MS = 200;
const SPEED_SAMPLE_MAX_GENERATION_MS = 3_600_000;
const SUBAGENT_ACTIVE_WINDOW_MS = 30_000;
const TOOL_ENTRIES_LIMIT = 8;
const SUBAGENT_ENTRIES_LIMIT = 6;

interface ModelUsageSpeedRow {
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  model_id: string;
  started_at: number;
  first_token_at: number | null;
  completed_at: number | null;
  duration_ms: number | null;
  time_to_first_token_ms: number | null;
}

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : toNumber(value);
}

export function localDayStartEpochMs(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** 生成窗口（ms）：无效样本返回 null。reasoning>0 或 Claude 系模型首字前有思考，改用整请求窗口。 */
function generationWindowMs(row: ModelUsageSpeedRow): number | null {
  const { first_token_at: firstTokenAt, completed_at: completedAt, started_at: startedAt } = row;
  if (!completedAt) return null;
  const reasoningLike = row.reasoning_tokens > 0 || row.model_id.toLowerCase().includes("claude");
  if (reasoningLike) {
    return completedAt > startedAt ? completedAt - startedAt : null;
  }
  if (!firstTokenAt || completedAt <= firstTokenAt) return null;
  return completedAt - firstTokenAt;
}

function isUsableSpeedSample(row: ModelUsageSpeedRow): boolean {
  const windowMs = generationWindowMs(row);
  return (
    row.output_tokens > 0 &&
    windowMs !== null &&
    windowMs >= SPEED_SAMPLE_MIN_GENERATION_MS &&
    windowMs < SPEED_SAMPLE_MAX_GENERATION_MS
  );
}

/** 加权速度：Σ输出 ÷ Σ生成窗口；无可评级样本返回 null。 */
function weightedTokensPerSecond(rows: ModelUsageSpeedRow[]): number | null {
  let outputSum = 0;
  let windowSumMs = 0;
  for (const row of rows) {
    if (!isUsableSpeedSample(row)) continue;
    outputSum += row.output_tokens;
    windowSumMs += generationWindowMs(row) as number;
  }
  if (outputSum <= 0 || windowSumMs <= 0) return null;
  return Math.round((outputSum / (windowSumMs / 1000)) * 10) / 10;
}

function breakdownFromAggregateRow(row: Record<string, unknown> | undefined): TokenUsageBreakdown {
  if (!row) return { ...EMPTY_TOKEN_USAGE_BREAKDOWN };
  return {
    inputTokens: toNumber(row["input"]),
    outputTokens: toNumber(row["output"]),
    reasoningTokens: toNumber(row["reasoning"]),
    cacheReadTokens: toNumber(row["cache_read"]),
    cacheWriteTokens: toNumber(row["cache_write"]),
    totalTokens: toNumber(row["total"]),
  };
}

const SESSION_AGGREGATE_SQL = `
  select count(distinct turn_id) as turns, count(*) as requests, sum(retry_count) as retries,
    sum(input_tokens) as input, sum(output_tokens) as output, sum(reasoning_tokens) as reasoning,
    sum(cache_read_input_tokens) as cache_read, sum(cache_creation_input_tokens) as cache_write,
    sum(computed_total_tokens) as total, sum(tool_call_count) as tool_calls,
    max(coalesce(completed_at, started_at)) as last_at
  from model_usage where session_id = ? and status = 'completed'`;

const MAIN_TURN_COMPLETED_SQL = `
  select input_tokens, output_tokens, reasoning_tokens, model_id, started_at, first_token_at, completed_at,
    duration_ms, time_to_first_token_ms
  from model_usage
  where session_id = ? and status = 'completed' and (query_source is null or query_source = 'main_turn')
  order by coalesce(completed_at, started_at) desc, id desc`;

function readLastTurn(database: DatabaseSync, sessionId: string): TokenUsageLastTurn | null {
  const latestTurnRow = database
    .prepare(
      `select turn_id from model_usage
        where session_id = ? and status = 'completed' and turn_id is not null
        order by coalesce(completed_at, started_at) desc, id desc limit 1`,
    )
    .get(sessionId) as { turn_id: string } | undefined;
  if (!latestTurnRow) return null;
  const turnId = latestTurnRow.turn_id;
  const rows = database
    .prepare(
      `select count(*) as requests, sum(retry_count) as retries, sum(input_tokens) as input,
        sum(output_tokens) as output, sum(reasoning_tokens) as reasoning,
        sum(cache_read_input_tokens) as cache_read, sum(cache_creation_input_tokens) as cache_write,
        sum(computed_total_tokens) as total, sum(tool_call_count) as tool_calls,
        min(started_at) as started, max(completed_at) as ended,
        min(case when time_to_first_token_ms > 0 then time_to_first_token_ms end) as ttft
      from model_usage where session_id = ? and turn_id = ? and status = 'completed'`,
    )
    .get(sessionId, turnId) as Record<string, unknown> | undefined;
  if (!rows || toNumber(rows["requests"]) === 0) return null;
  const speedRows = database
    .prepare(
      `select output_tokens, reasoning_tokens, model_id, started_at, first_token_at, completed_at,
        duration_ms, time_to_first_token_ms
      from model_usage where session_id = ? and turn_id = ? and status = 'completed'`,
    )
    .all(sessionId, turnId) as unknown as ModelUsageSpeedRow[];
  const startedAt = toNullableNumber(rows["started"]);
  const endedAt = toNullableNumber(rows["ended"]);
  const turnErrors = database
    .prepare(
      `select count(*) as count from tool_usage where session_id = ? and turn_id = ? and status = 'error'`,
    )
    .get(sessionId, turnId) as { count: number } | undefined;
  return {
    turnId,
    requests: toNumber(rows["requests"]),
    tokens: breakdownFromAggregateRow(rows),
    durationMs:
      startedAt !== null && endedAt !== null && endedAt > startedAt ? endedAt - startedAt : 0,
    timeToFirstTokenMs: toNullableNumber(rows["ttft"]),
    tokensPerSecond: weightedTokensPerSecond(speedRows),
    toolCalls: toNumber(rows["tool_calls"]),
    toolErrors: toNumber(turnErrors?.["count"]),
    startedAt,
    endedAt,
  };
}

function readLastRequest(mainTurnRows: ModelUsageSpeedRow[]): TokenUsageLastRequest | null {
  const latest = mainTurnRows[0];
  if (!latest) return null;
  // 最近完成请求本身不是有效速度样本时，向前回看最多 20 条取最近有效值（zusage 口径）
  const lookback = mainTurnRows.slice(0, 20).find((row) => isUsableSpeedSample(row));
  const tokensPerSecond =
    lookback && lookback.output_tokens > 0
      ? Math.round(
          (lookback.output_tokens / ((generationWindowMs(lookback) as number) / 1000)) * 10,
        ) / 10
      : null;
  return {
    modelId: latest.model_id,
    tokensPerSecond,
    durationMs: toNumber(latest.duration_ms),
    timeToFirstTokenMs: toNullableNumber(latest.time_to_first_token_ms),
    startedAt: latest.started_at,
    endedAt: latest.completed_at ?? latest.started_at,
  };
}

function readToolUsage(
  database: DatabaseSync,
  sessionId: string,
): TokenUsageSessionSnapshot["tools"] {
  const entries = database
    .prepare(
      `select tool_name as name, count(*) as calls, coalesce(sum(duration_ms), 0) as duration_ms,
        sum(case when status = 'error' then 1 else 0 end) as errors
      from tool_usage where session_id = ? and status in ('completed', 'error')
      group by tool_name order by calls desc, tool_name asc`,
    )
    .all(sessionId) as unknown as Record<string, unknown>[];
  const toolEntries: TokenUsageToolEntry[] = entries.map((entry) => ({
    name: String(entry["name"]),
    calls: toNumber(entry["calls"]),
    durationMs: toNumber(entry["duration_ms"]),
    errors: toNumber(entry["errors"]),
  }));
  return {
    totalCalls: toolEntries.reduce((sum, entry) => sum + entry.calls, 0),
    errorCalls: toolEntries.reduce((sum, entry) => sum + entry.errors, 0),
    entries: toolEntries.slice(0, TOOL_ENTRIES_LIMIT),
  };
}

function readSubagents(
  database: DatabaseSync,
  sessionId: string,
  nowEpochMs: number,
): TokenUsageSessionSnapshot["subagents"] {
  const children = database
    .prepare(`select id, title from session where parent_id = ?`)
    .all(sessionId) as unknown as { id: string; title: string }[];
  const entries: TokenUsageSubagentEntry[] = [];
  for (const child of children) {
    const aggregate = database
      .prepare(
        `select count(*) as requests, sum(computed_total_tokens) as total,
        max(coalesce(completed_at, started_at)) as last_at, max(agent) as agent
      from model_usage where session_id = ? and status = 'completed' and query_source = 'subagent'`,
      )
      .get(child.id) as Record<string, unknown> | undefined;
    if (!aggregate || toNumber(aggregate["requests"]) === 0) continue;
    const lastAt = toNullableNumber(aggregate["last_at"]);
    entries.push({
      sessionId: child.id,
      title: child.title,
      agent: String(aggregate["agent"] ?? "subagent"),
      requests: toNumber(aggregate["requests"]),
      totalTokens: toNumber(aggregate["total"]),
      active: lastAt !== null && nowEpochMs - lastAt < SUBAGENT_ACTIVE_WINDOW_MS,
    });
  }
  entries.sort((left, right) => right.totalTokens - left.totalTokens);
  return {
    totalTokens: entries.reduce((sum, entry) => sum + entry.totalTokens, 0),
    activeCount: entries.filter((entry) => entry.active).length,
    entries: entries.slice(0, SUBAGENT_ENTRIES_LIMIT),
  };
}

export function readTokenUsageSessionSnapshot(
  database: DatabaseSync,
  sessionId: string,
  nowEpochMs = Date.now(),
): TokenUsageSessionSnapshot {
  const aggregate = database.prepare(SESSION_AGGREGATE_SQL).get(sessionId) as
    | Record<string, unknown>
    | undefined;
  const mainTurnRows = database
    .prepare(MAIN_TURN_COMPLETED_SQL)
    .all(sessionId) as unknown as ModelUsageSpeedRow[];
  // 与 zusage 差异：分子只取 main_turn 请求的 input——标题生成等辅助请求的输入不代表会话上下文
  const latestMainRow = mainTurnRows[0];
  const contextExceededAt = toNullableNumber(
    (
      database
        .prepare(
          `select max(coalesce(completed_at, started_at)) as exceeded_at
          from model_usage where session_id = ? and context_exceeded = 1`,
        )
        .get(sessionId) as { exceeded_at: unknown } | undefined
    )?.["exceeded_at"],
  );
  return {
    sessionId,
    turns: toNumber(aggregate?.["turns"]),
    requests: toNumber(aggregate?.["requests"]),
    retries: toNumber(aggregate?.["retries"]),
    tokens: breakdownFromAggregateRow(aggregate),
    averageTokensPerSecond: weightedTokensPerSecond(mainTurnRows) ?? 0,
    lastTurn: readLastTurn(database, sessionId),
    lastRequest: readLastRequest(mainTurnRows),
    tools: readToolUsage(database, sessionId),
    subagents: readSubagents(database, sessionId, nowEpochMs),
    lastRequestInputTokens: latestMainRow ? latestMainRow.input_tokens : null,
    contextExceededAt,
    updatedAt: toNullableNumber(aggregate?.["last_at"]),
  };
}

export function readTokenUsageTodaySummary(
  database: DatabaseSync,
  dayStartEpochMs: number,
): TokenUsageTodaySummary {
  const dayEndEpochMs = dayStartEpochMs + 86_400_000;
  const row = database
    .prepare(
      `select count(*) as requests, sum(input_tokens) as input, sum(output_tokens) as output,
        sum(reasoning_tokens) as reasoning, sum(cache_read_input_tokens) as cache_read,
        sum(cache_creation_input_tokens) as cache_write, sum(computed_total_tokens) as total
      from model_usage where status = 'completed' and completed_at >= ? and completed_at < ?`,
    )
    .get(dayStartEpochMs, dayEndEpochMs) as Record<string, unknown> | undefined;
  return { requests: toNumber(row?.["requests"]), tokens: breakdownFromAggregateRow(row) };
}

export function buildTokenUsageWindowSnapshot(
  database: DatabaseSync,
  sessionIds: string[],
  now = new Date(),
): TokenUsageWindowSnapshot {
  const nowEpochMs = now.getTime();
  const sessions: TokenUsageWindowSnapshot["sessions"] = {};
  for (const sessionId of new Set(sessionIds)) {
    if (!sessionId) continue;
    sessions[sessionId] = readTokenUsageSessionSnapshot(database, sessionId, nowEpochMs);
  }
  return {
    sessions,
    today: readTokenUsageTodaySummary(database, localDayStartEpochMs(now)),
    generatedAt: nowEpochMs,
  };
}
