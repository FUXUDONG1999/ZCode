import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildTokenUsageWindowSnapshot,
  localDayStartEpochMs,
} from "#src/main/tokenUsageSnapshotQuery.js";

const NOW = new Date(2026, 10, 2, 12, 0, 0);

function createFixtureDatabase(databasePath: string) {
  const database = new DatabaseSync(databasePath);
  database.exec(`
    create table session (
      id text primary key, project_id text not null default 'p', parent_id text,
      title text not null default '', time_created integer not null default 0, time_updated integer not null default 0
    );
    create table model_usage (
      id text primary key, session_id text not null, turn_id text, query_source text,
      provider_id text not null default 'account:x', model_id text not null default 'm',
      agent text, status text not null, started_at integer not null, first_token_at integer, completed_at integer,
      duration_ms integer, time_to_first_token_ms, tool_call_count integer not null default 0,
      input_tokens integer not null default 0, output_tokens integer not null default 0,
      reasoning_tokens integer not null default 0, cache_creation_input_tokens integer not null default 0,
      cache_read_input_tokens integer not null default 0, computed_total_tokens integer not null default 0,
      retry_count integer not null default 0, context_exceeded integer not null default 0
    );
    create table tool_usage (
      id text primary key, session_id text not null, turn_id text, tool_name text not null,
      status text not null, duration_ms integer
    );
  `);
  const insertSession = database.prepare(
    "insert into session (id, parent_id, title) values (?, ?, ?)",
  );
  insertSession.run("sess_main", null, "主会话");
  insertSession.run("sess_subagent_a", "sess_main", "调研子代理");
  const insertUsage = database.prepare(`
    insert into model_usage (id, session_id, turn_id, query_source, status, started_at, first_token_at, completed_at,
      duration_ms, time_to_first_token_ms, tool_call_count, input_tokens, output_tokens, reasoning_tokens,
      cache_creation_input_tokens, cache_read_input_tokens, computed_total_tokens, retry_count, context_exceeded)
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  // t1 普通请求：gen = 11s−1s = 10s，200 输出 → 20 t/s
  insertUsage.run(
    "m1",
    "sess_main",
    "t1",
    "main_turn",
    "completed",
    0,
    1_000,
    11_000,
    11_000,
    1_000,
    1,
    1_000,
    200,
    0,
    100,
    400,
    1_200,
    0,
    0,
  );
  // t2 reasoning 请求：gen = 30s−20s = 10s，300 输出 → 30 t/s（首字窗口不适用于 reasoning）
  insertUsage.run(
    "m2",
    "sess_main",
    "t2",
    "main_turn",
    "completed",
    20_000,
    26_000,
    30_000,
    10_000,
    6_000,
    0,
    2_000,
    300,
    50,
    0,
    800,
    2_300,
    1,
    0,
  );
  // 标题生成辅助请求：计入会话总量，但速度/上下文口径排除
  insertUsage.run(
    "m3",
    "sess_main",
    null,
    "session_title",
    "completed",
    31_000,
    31_100,
    32_000,
    1_000,
    100,
    0,
    50,
    10,
    0,
    0,
    0,
    60,
    0,
    0,
  );
  // 运行中与失败行：任何口径都不计
  insertUsage.run(
    "m4",
    "sess_main",
    "t2",
    "main_turn",
    "running",
    33_000,
    null,
    null,
    null,
    null,
    0,
    5_000,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
  );
  insertUsage.run(
    "m5",
    "sess_main",
    "t1",
    "main_turn",
    "error",
    40_000,
    null,
    41_000,
    1_000,
    null,
    0,
    900,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
  );
  // 子代理会话请求
  insertUsage.run(
    "s1",
    "sess_subagent_a",
    "st1",
    "subagent",
    "completed",
    35_000,
    35_200,
    36_000,
    1_000,
    200,
    0,
    300,
    200,
    0,
    0,
    0,
    500,
    0,
    0,
  );
  const insertTool = database.prepare(
    "insert into tool_usage (id, session_id, turn_id, tool_name, status, duration_ms) values (?, ?, ?, ?, ?, ?)",
  );
  insertTool.run("tool1", "sess_main", "t1", "Bash", "completed", 800);
  insertTool.run("tool2", "sess_main", "t2", "Bash", "completed", 900);
  insertTool.run("tool3", "sess_main", "t2", "Grep", "error", 100);
  return database;
}

describe("token usage snapshot query", () => {
  let rootDirectory: string;
  let database: DatabaseSync;

  beforeEach(async () => {
    rootDirectory = await mkdtemp(join(tmpdir(), "zcode-token-usage-query-"));
    await mkdir(rootDirectory, { recursive: true });
    database = createFixtureDatabase(join(rootDirectory, "db.sqlite"));
  });

  afterEach(async () => {
    database.close();
    await rm(rootDirectory, { recursive: true, force: true });
  });

  it("会话总量含辅助请求、不含运行中/失败行；total=input+output", () => {
    const snapshot = buildTokenUsageWindowSnapshot(database, ["sess_main"], NOW);
    const session = snapshot.sessions["sess_main"];
    if (!session) throw new Error("session snapshot missing");
    expect(session.requests).toBe(3);
    expect(session.turns).toBe(2);
    expect(session.tokens.inputTokens).toBe(3_050);
    expect(session.tokens.outputTokens).toBe(510);
    expect(session.tokens.cacheReadTokens).toBe(1_200);
    expect(session.tokens.totalTokens).toBe(3_560);
    expect(session.retries).toBe(1);
  });

  it("会话均速度只取 main_turn 有效样本：Σ输出÷Σ生成窗口", () => {
    const session = buildTokenUsageWindowSnapshot(database, ["sess_main"], NOW).sessions[
      "sess_main"
    ];
    if (!session) throw new Error("session snapshot missing");
    // (200+300) 输出 ÷ (10s+10s) 生成窗口 = 25 t/s；标题生成 10 输出不参与
    expect(session.averageTokensPerSecond).toBe(25);
  });

  it("最近一轮与最近请求按 t2 口径，reasoning 用整请求窗口", () => {
    const session = buildTokenUsageWindowSnapshot(database, ["sess_main"], NOW).sessions[
      "sess_main"
    ];
    if (!session?.lastTurn || !session?.lastRequest) throw new Error("last turn/request missing");
    expect(session.lastTurn.turnId).toBe("t2");
    expect(session.lastTurn.tokens.totalTokens).toBe(2_300);
    expect(session.lastTurn.tokensPerSecond).toBe(30);
    expect(session.lastTurn.durationMs).toBe(10_000);
    expect(session.lastTurn.timeToFirstTokenMs).toBe(6_000);
    expect(session.lastRequest.modelId).toBe("m");
    expect(session.lastRequest.tokensPerSecond).toBe(30);
    expect(session.lastRequestInputTokens).toBe(2_000);
  });

  it("工具聚合计入 error，条目按调用量排序", () => {
    const session = buildTokenUsageWindowSnapshot(database, ["sess_main"], NOW).sessions[
      "sess_main"
    ];
    if (!session) throw new Error("session snapshot missing");
    expect(session.tools.totalCalls).toBe(3);
    expect(session.tools.errorCalls).toBe(1);
    expect(session.tools.entries[0]).toMatchObject({ name: "Bash", calls: 2, errors: 0 });
    expect(session.tools.entries[1]).toMatchObject({ name: "Grep", calls: 1, errors: 1 });
  });

  it("子代理按 parent_id 归属并按 30s 活跃窗口标记", () => {
    const snapshot = buildTokenUsageWindowSnapshot(database, ["sess_main"], NOW);
    const subagents = snapshot.sessions["sess_main"]?.subagents;
    if (!subagents) throw new Error("subagents missing");
    expect(subagents.totalTokens).toBe(500);
    expect(subagents.activeCount).toBe(0);
    expect(subagents.entries).toHaveLength(1);
    expect(subagents.entries[0]).toMatchObject({
      sessionId: "sess_subagent_a",
      totalTokens: 500,
      active: false,
    });
    const recentSnapshot = buildTokenUsageWindowSnapshot(database, ["sess_main"], new Date(35_500));
    expect(recentSnapshot.sessions["sess_main"]?.subagents.activeCount).toBe(1);
  });

  it("今日合计按本地自然日闭开区间，只含 completed", () => {
    const insertUsage = database.prepare(`
      insert into model_usage (id, session_id, turn_id, query_source, status, started_at, completed_at,
        input_tokens, output_tokens, computed_total_tokens)
      values (?, 'sess_main', 'tx', 'main_turn', 'completed', ?, ?, 10, 10, 20)
    `);
    const todayStart = localDayStartEpochMs(NOW);
    insertUsage.run("today1", todayStart + 3_600_000, todayStart + 3_600_100);
    insertUsage.run("yesterday1", todayStart - 1_000, todayStart - 500);
    insertUsage.run("tomorrow1", todayStart + 86_400_000, todayStart + 86_400_100);
    // fixture 其余行的时间戳都在 1970 纪元附近，不在 2026-11-02 当日窗口内
    const today = buildTokenUsageWindowSnapshot(database, [], NOW).today;
    expect(today.requests).toBe(1);
    expect(today.tokens.totalTokens).toBe(20);
  });

  it("context_exceeded 晚于最近成功请求时可见", () => {
    database
      .prepare("update model_usage set context_exceeded = 1, completed_at = 45_000 where id = 'm5'")
      .run();
    const session = buildTokenUsageWindowSnapshot(database, ["sess_main"], NOW).sessions[
      "sess_main"
    ];
    expect(session?.contextExceededAt).toBe(45_000);
  });
});
