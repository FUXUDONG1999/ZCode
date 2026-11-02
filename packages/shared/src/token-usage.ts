import { z } from "zod";

/**
 * 个人定制：token 用量状态条的快照契约（主进程 SQLite 查询 → IPC 推送 → composer 状态条）。
 * 口径与 vendored 时期的 zusage.py 对齐：total = input + output（input 已含 cache read，
 * output 已含 reasoning，不得再叠加）；只计 status='completed' 的请求。
 */

export const tokenUsageBreakdownSchema = z
  .object({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    reasoningTokens: z.number().int().nonnegative(),
    cacheReadTokens: z.number().int().nonnegative(),
    cacheWriteTokens: z.number().int().nonnegative(),
    totalTokens: z.number().int().nonnegative(),
  })
  .strict();
export type TokenUsageBreakdown = z.infer<typeof tokenUsageBreakdownSchema>;

export const tokenUsageLastRequestSchema = z
  .object({
    modelId: z.string(),
    /** 输出 ÷ 生成窗口（completed_at−first_token_at；reasoning 型请求用 completed_at−started_at），无有效样本为 null */
    tokensPerSecond: z.number().positive().nullable(),
    durationMs: z.number().nonnegative(),
    timeToFirstTokenMs: z.number().nonnegative().nullable(),
    startedAt: z.number(),
    endedAt: z.number(),
  })
  .strict();
export type TokenUsageLastRequest = z.infer<typeof tokenUsageLastRequestSchema>;

export const tokenUsageLastTurnSchema = z
  .object({
    turnId: z.string().nullable(),
    requests: z.number().int().nonnegative(),
    tokens: tokenUsageBreakdownSchema,
    durationMs: z.number().nonnegative(),
    timeToFirstTokenMs: z.number().nonnegative().nullable(),
    /** 本轮加权速度：Σ输出 ÷ Σ有效生成窗口；无可评级样本为 null */
    tokensPerSecond: z.number().positive().nullable(),
    toolCalls: z.number().int().nonnegative(),
    toolErrors: z.number().int().nonnegative(),
    startedAt: z.number().nullable(),
    endedAt: z.number().nullable(),
  })
  .strict();
export type TokenUsageLastTurn = z.infer<typeof tokenUsageLastTurnSchema>;

export const tokenUsageToolEntrySchema = z
  .object({
    name: z.string(),
    calls: z.number().int().nonnegative(),
    durationMs: z.number().nonnegative(),
    errors: z.number().int().nonnegative(),
  })
  .strict();
export type TokenUsageToolEntry = z.infer<typeof tokenUsageToolEntrySchema>;

export const tokenUsageSubagentEntrySchema = z
  .object({
    sessionId: z.string(),
    title: z.string(),
    agent: z.string(),
    requests: z.number().int().nonnegative(),
    totalTokens: z.number().int().nonnegative(),
    /** 最近一次完成请求在 30s 内视为运行中 */
    active: z.boolean(),
  })
  .strict();
export type TokenUsageSubagentEntry = z.infer<typeof tokenUsageSubagentEntrySchema>;

export const tokenUsageSessionSnapshotSchema = z
  .object({
    sessionId: z.string(),
    turns: z.number().int().nonnegative(),
    requests: z.number().int().nonnegative(),
    retries: z.number().int().nonnegative(),
    tokens: tokenUsageBreakdownSchema,
    /** 会话均：全部已完成 main_turn 请求的 Σ输出 ÷ Σ有效生成窗口；无样本为 0 */
    averageTokensPerSecond: z.number().nonnegative(),
    lastTurn: tokenUsageLastTurnSchema.nullable(),
    lastRequest: tokenUsageLastRequestSchema.nullable(),
    tools: z
      .object({
        totalCalls: z.number().int().nonnegative(),
        errorCalls: z.number().int().nonnegative(),
        entries: z.array(tokenUsageToolEntrySchema),
      })
      .strict(),
    subagents: z
      .object({
        totalTokens: z.number().int().nonnegative(),
        activeCount: z.number().int().nonnegative(),
        entries: z.array(tokenUsageSubagentEntrySchema),
      })
      .strict(),
    /** 最近完成请求的 input（上下文容量的 DB 口径分子；压缩后可回落） */
    lastRequestInputTokens: z.number().int().nonnegative().nullable(),
    /** 最近一次 context_exceeded 完成时间；晚于最近成功请求时上下文条闪红 */
    contextExceededAt: z.number().nullable(),
    updatedAt: z.number().nullable(),
  })
  .strict();
export type TokenUsageSessionSnapshot = z.infer<typeof tokenUsageSessionSnapshotSchema>;

export const tokenUsageTodaySummarySchema = z
  .object({
    requests: z.number().int().nonnegative(),
    tokens: tokenUsageBreakdownSchema,
  })
  .strict();
export type TokenUsageTodaySummary = z.infer<typeof tokenUsageTodaySummarySchema>;

export const tokenUsageWindowSnapshotSchema = z
  .object({
    /** 本窗口可见会话（各窗口焦点会话并集），键为 session id */
    sessions: z.record(z.string(), tokenUsageSessionSnapshotSchema),
    today: tokenUsageTodaySummarySchema,
    generatedAt: z.number(),
  })
  .strict();
export type TokenUsageWindowSnapshot = z.infer<typeof tokenUsageWindowSnapshotSchema>;

export const EMPTY_TOKEN_USAGE_BREAKDOWN: TokenUsageBreakdown = {
  inputTokens: 0,
  outputTokens: 0,
  reasoningTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  totalTokens: 0,
};
