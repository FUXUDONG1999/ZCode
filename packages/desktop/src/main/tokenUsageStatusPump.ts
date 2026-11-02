import { existsSync, watch, type FSWatcher } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { ipcMain, webContents } from "electron";
import { PlatformChannels, type TokenUsageWindowSnapshot } from "@zcode/shared";
import { buildTokenUsageWindowSnapshot } from "./tokenUsageSnapshotQuery.js";

const nodeRequire = createRequire(import.meta.url);
// tsup/esbuild 会改写动态 import("node:sqlite") 的 node: 协议，createRequire 稳定（同 chromeCookieManager）
const { DatabaseSync } = nodeRequire("node:sqlite") as typeof import("node:sqlite");

const CHANGE_DEBOUNCE_MS = 300;
const HEARTBEAT_MS = 30_000;

interface TokenUsageLogger {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
}

export interface TokenUsagePushTarget {
  isDestroyed(): boolean;
  send(channel: string, payload: TokenUsageWindowSnapshot): void;
}

/**
 * 查询并推送一帧快照。连接按次开关（node:sqlite 打开为亚毫秒级，免去常驻连接的
 * 文件换代/错误重建管理）；任何失败只返回 false，由调用方记日志。
 */
export function pushTokenUsageSnapshotToTargets(options: {
  databasePath: string;
  sessionIds: string[];
  targets: TokenUsagePushTarget[];
  now?: Date;
}): boolean {
  const liveSessionIds = [...new Set(options.sessionIds)].filter(
    (sessionId) => sessionId.length > 0,
  );
  const liveTargets = options.targets.filter((target) => !target.isDestroyed());
  if (liveSessionIds.length === 0 || liveTargets.length === 0 || !existsSync(options.databasePath))
    return false;
  let database: InstanceType<typeof DatabaseSync> | null = null;
  try {
    database = new DatabaseSync(options.databasePath, { readOnly: true });
    database.exec("PRAGMA busy_timeout = 2000");
    const snapshot = buildTokenUsageWindowSnapshot(
      database,
      liveSessionIds,
      options.now ?? new Date(),
    );
    for (const target of liveTargets) target.send(PlatformChannels.TokenUsageSnapshot, snapshot);
    return true;
  } catch {
    return false;
  } finally {
    try {
      database?.close();
    } catch {
      // 关闭失败不影响下一帧重建连接
    }
  }
}

/** 事件驱动的用量快照泵：fs.watch DB 目录 + 焦点会话映射，向各窗口推送本窗快照。 */
export function startTokenUsageStatusPump(options: {
  logger: TokenUsageLogger;
  resolveDatabasePath: () => Promise<string | null>;
  debounceMs?: number;
  heartbeatMs?: number;
}): { stop: () => void } {
  const { logger } = options;
  const debounceMs = options.debounceMs ?? CHANGE_DEBOUNCE_MS;
  const activeSessionByWebContentsId = new Map<number, string>();
  let databasePath: string | null = null;
  let watcher: FSWatcher | null = null;
  let heartbeatTimer: NodeJS.Timeout | null = null;
  let debounceTimer: NodeJS.Timeout | null = null;
  let stopped = false;
  let lastWarnKey = "";
  let firstPushLogged = false;

  function warnOnce(key: string, ...args: unknown[]) {
    if (lastWarnKey === key) return;
    lastWarnKey = key;
    logger.warn(...args);
  }

  function activeSessionIds(): string[] {
    const liveIds: string[] = [];
    for (const [webContentsId, sessionId] of activeSessionByWebContentsId) {
      const contents = webContents.fromId(webContentsId);
      if (!contents || contents.isDestroyed()) {
        activeSessionByWebContentsId.delete(webContentsId);
        continue;
      }
      liveIds.push(sessionId);
    }
    return liveIds;
  }

  function runCycle() {
    if (stopped || !databasePath) return;
    const sessionIds = activeSessionIds();
    const targets = [...activeSessionByWebContentsId.keys()].map((webContentsId) =>
      webContents.fromId(webContentsId),
    );
    const pushed = pushTokenUsageSnapshotToTargets({
      databasePath,
      sessionIds,
      targets: targets.filter((target): target is Electron.WebContents => target !== null),
    });
    if (pushed && !firstPushLogged) {
      firstPushLogged = true;
      logger.info("[token-usage] snapshot pump active", { sessions: sessionIds.length, targets: targets.length });
    }
    if (!pushed && sessionIds.length > 0)
      warnOnce("query-failed", "[token-usage] snapshot query failed, will retry on next change");
  }

  function scheduleQuery() {
    if (stopped) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      runCycle();
    }, debounceMs);
  }

  function handleActiveSessionChange(webContentsId: number, sessionId: string) {
    if (activeSessionByWebContentsId.get(webContentsId) === sessionId) return;
    activeSessionByWebContentsId.set(webContentsId, sessionId);
    // 切换会话立即出数，不等 DB 变化
    runCycle();
  }

  const activeSessionListener = (_event: Electron.IpcMainEvent, sessionId: unknown) => {
    const webContentsId = _event.sender.id;
    if (typeof sessionId === "string") handleActiveSessionChange(webContentsId, sessionId);
  };

  function start() {
    if (stopped) return;
    void options
      .resolveDatabasePath()
      .then((resolvedPath) => {
        if (stopped) return;
        if (!resolvedPath) {
          logger.info("[token-usage] session database path unresolved, pump idle");
          return;
        }
        databasePath = resolvedPath;
        try {
          // 官方文档：fs.watch 事件不保证送达，30s 心跳兜底；空闲时无会话则零查询
          watcher = watch(dirname(databasePath), { persistent: false }, (eventName, fileName) => {
            if (!fileName || fileName.startsWith("db.sqlite")) scheduleQuery();
          });
          watcher.on("error", (error) =>
            warnOnce("watch-error", "[token-usage] db watch failed:", error?.message),
          );
        } catch (error) {
          warnOnce("watch-start-failed", "[token-usage] db watch start failed:", error);
        }
        heartbeatTimer = setInterval(() => {
          if (activeSessionByWebContentsId.size > 0) runCycle();
        }, options.heartbeatMs ?? HEARTBEAT_MS);
        ipcMain.on(PlatformChannels.SyncActiveTaskSession, activeSessionListener);
        if (activeSessionByWebContentsId.size > 0) runCycle();
      })
      .catch((error) => logger.warn("[token-usage] pump start failed:", error));
  }

  start();

  return {
    stop() {
      stopped = true;
      ipcMain.removeListener(PlatformChannels.SyncActiveTaskSession, activeSessionListener);
      if (debounceTimer) clearTimeout(debounceTimer);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      try {
        watcher?.close();
      } catch {
        // 关闭失败无需处理
      }
    },
  };
}
