import { mkdirSync, appendFileSync } from "node:fs";
import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { formatTimestamp } from "@zcode/shared";
import { cleanupExpiredLogFiles, LOG_RETENTION_DAYS } from "./logRetention.js";
import { getAppConfigDir, maybeThrowInjectedFsFault } from "@zcode/services/node";

function getLogDir() {
    const e2eLogDir =
        process.env.ZCODE_ENV === "test"
            ? process.env.ZCODE_E2E_RUNTIME_LOG_DIR?.trim()
            : undefined;
    if (e2eLogDir) {
        return e2eLogDir;
    }
    return join(getAppConfigDir(), "logs");
}

// 启动时确保日志目录存在
const LOG_DIR = getLogDir();

/**
 * 日志行缓冲与异步落盘。
 *
 * 修复依据：性能 trace 实测 main 进程 48 秒内累计 1.26s 阻塞在 appendFileSync
 * （writeFileUtf8）上——旧实现每写一行日志都执行 mkdirSync + appendFileSync 两次
 * 同步系统调用，host 流式期间结构化日志高频到达时会持续阻塞事件循环，拖慢 IPC
 * 转发与窗口操作。改为：行先进内存队列，setImmediate 合并同一轮事件循环内的
 * 行为一次异步 appendFile；每个文件路径用链式 promise 保证顺序；进程退出时
 * 同步兜底刷盘；缓冲上限防止磁盘卡死时内存无限增长。
 */
const PENDING_LOG_LINE_LIMIT_PER_FILE = 2000;

interface PendingLogFileState {
    lines: string[];
    writeChain: Promise<void>;
    flushScheduled: boolean;
    /** 已交给 appendFile 但尚未完成的批次；退出兜底时重写一遍，宁可偶尔重复也不丢行。 */
    inFlightPayload: string | null;
}

const ensuredLogDirectories = new Set<string>();
const pendingLogFiles = new Map<string, PendingLogFileState>();

function ensureLogDirectory(directory: string): void {
    if (ensuredLogDirectories.has(directory)) return;
    mkdirSync(directory, { recursive: true });
    ensuredLogDirectories.add(directory);
}

function appendPendingPayload(filePath: string, payload: string): Promise<void> {
    return appendFile(filePath, payload, "utf8").catch(async (error: unknown) => {
        // 旧实现每次写前都 mkdirSync，天然容忍运行中日志目录被外部删除；
        // 改为一次性建目录后需要在这里补建重试一次，保持同等健壮性。
        if ((error as { code?: string } | null)?.code !== "ENOENT") {
            return;
        }

        await mkdir(dirname(filePath), { recursive: true }).catch(() => {});
        await appendFile(filePath, payload, "utf8").catch(() => {});
    });
}

function flushPendingLogLines(filePath: string, fileState: PendingLogFileState): void {
    fileState.flushScheduled = false;
    fileState.writeChain = fileState.writeChain.then(async () => {
        while (fileState.lines.length > 0) {
            const payload = fileState.lines.join("");
            fileState.lines.length = 0;
            fileState.inFlightPayload = payload;
            try {
                maybeThrowInjectedFsFault({ operation: "appendFile", path: filePath });
                await appendPendingPayload(filePath, payload);
            } catch {
                // 日志写入失败不应影响应用运行，丢弃本批（与旧实现的 catch 语义一致）。
            } finally {
                fileState.inFlightPayload = null;
            }
        }
    });
}

function appendLogLine(filePath: string, line: string): void {
    let fileState = pendingLogFiles.get(filePath);
    if (fileState === undefined) {
        fileState = {
            lines: [],
            writeChain: Promise.resolve(),
            flushScheduled: false,
            inFlightPayload: null,
        };
        pendingLogFiles.set(filePath, fileState);
    }

    if (fileState.lines.length >= PENDING_LOG_LINE_LIMIT_PER_FILE) {
        fileState.lines.shift();
    }
    fileState.lines.push(line);

    if (fileState.flushScheduled) return;
    fileState.flushScheduled = true;
    const scheduledState = fileState;
    setImmediate(() => {
        if (scheduledState.lines.length === 0) {
            scheduledState.flushScheduled = false;
            return;
        }
        flushPendingLogLines(filePath, scheduledState);
    });
}

process.on("exit", () => {
    // 退出时同步刷掉残留缓冲与仍在途的批次，保证进程收尾前最后几行日志不丢。
    // 若异步写实际已完成但回调未及执行，可能偶发重复一行；日志诊断宁重复不丢失。
    for (const [filePath, fileState] of pendingLogFiles) {
        const payload = fileState.lines.join("") + (fileState.inFlightPayload ?? "");
        fileState.lines.length = 0;
        fileState.inFlightPayload = null;
        if (payload.length === 0) continue;
        try {
            appendFileSync(filePath, payload);
        } catch {
            // 退出兜底写失败时静默丢弃，与常规写入策略一致。
        }
    }
});

/** 等待全部已缓冲日志行落盘；导出/打包日志前调用，避免归档漏掉最后几行。 */
export async function flushPendingLogWrites(): Promise<void> {
    const flushes: Array<Promise<void>> = [];
    for (const [filePath, fileState] of pendingLogFiles) {
        if (fileState.lines.length === 0) continue;
        flushPendingLogLines(filePath, fileState);
        flushes.push(fileState.writeChain);
    }
    await Promise.all(flushes);
}

ensureLogDirectory(LOG_DIR);

const logRetentionResult = cleanupExpiredLogFiles(LOG_DIR);
if (logRetentionResult.failedFiles.length > 0) {
    safeConsoleWrite(
        "warn",
        `[log-retention] failed to delete expired logs from ${LOG_DIR}:`,
        logRetentionResult.failedFiles,
        `retentionDays=${LOG_RETENTION_DAYS}`,
    );
}

type LogLevel = "debug" | "info" | "warn" | "error";

function isBrokenPipeError(error: unknown): boolean {
    return (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: unknown }).code === "EPIPE"
    );
}

function ignoreBrokenPipeStreamError(error: Error): void {
    // WDIO / dev runner 结束后可能先关闭 stdout/stderr 管道，随后主进程日志还在刷新。
    // stream error 是异步事件，try/catch 包 console.log 不一定兜得住；这里统一吞掉 EPIPE。
    if (!isBrokenPipeError(error)) {
        throw error;
    }
}

process.stdout.on("error", ignoreBrokenPipeStreamError);
process.stderr.on("error", ignoreBrokenPipeStreamError);

function safeConsoleWrite(level: LogLevel, ...args: unknown[]): void {
    const consoleFn =
        level === "error" ? console.error : level === "warn" ? console.warn : console.log;
    try {
        consoleFn(...args);
    } catch (error) {
        // dev 脚本或父终端退出后，Electron main 的 stdout/stderr 管道可能已关闭。
        // 这时 console.* 会抛 EPIPE，不能让日志输出反过来杀掉主进程；文件日志仍会继续写入。
        if (!isBrokenPipeError(error)) {
            throw error;
        }
    }
}

function formatDate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

function write(level: LogLevel, source: string, ...args: unknown[]) {
    const now = new Date();
    const ts = formatTimestamp(now);
    const pid = process.pid;
    const message = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
    const line = `[${ts}] [${level}] [pid:${pid}] [${source}] ${message}\n`;
    const logDir = getLogDir();
    ensureLogDirectory(logDir);
    const filePath = join(logDir, `${formatDate(now)}.log`);

    // 同时保留 console 输出，方便开发调试；console 也加时间戳和 PID，与文件格式对齐
    safeConsoleWrite(level, `[${ts}] [pid:${pid}] [${source}]`, ...args);

    appendLogLine(filePath, line);
}

function writeDedicated(filePrefix: string, level: LogLevel, source: string, ...args: unknown[]) {
    const now = new Date();
    const ts = formatTimestamp(now);
    const pid = process.pid;
    const message = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
    const line = `[${ts}] [${level}] [pid:${pid}] [${source}] ${message}\n`;
    const logDir = getLogDir();
    ensureLogDirectory(logDir);
    // Bugfix: 远控 relay trace 与主日志混放时，目录内文件会快速增多，人工排查不直观。
    // 这里把高频 trace 分流到 logs 子目录，避免影响主日志浏览与导出定位。
    const dedicatedDir = join(logDir, "web-remote-control");
    ensureLogDirectory(dedicatedDir);
    const filePath = join(dedicatedDir, `${filePrefix}-${formatDate(now)}.log`);

    appendLogLine(filePath, line);
}

/**
 * main 进程日志，默认写入 ~/.zcode/v2/logs/YYYY-MM-DD.log；E2E 测试使用 worker 专属目录。
 * 同时保留 console 输出方便开发调试
 */
export const logger = {
    // 高频 browser/CDP 等协议细节只在本地开发记录，避免生产日志量与命令流同数量级。
    debug: (...args: unknown[]) => {
        if (process.env.NODE_ENV !== "production") {
            write("debug", "main", ...args);
        }
    },
    info: (...args: unknown[]) => write("info", "main", ...args),
    warn: (...args: unknown[]) => write("warn", "main", ...args),
    error: (...args: unknown[]) => write("error", "main", ...args),

    /** renderer 日志通过 IPC 传入后调用此方法写入同一文件 */
    fromRenderer: (level: LogLevel, args: unknown[]) => write(level, "renderer", ...args),
};

/**
 * Web remote control relay message trace 专用日志。
 * 仅用于高频链路排障，独立落盘避免淹没主日志文件。
 */
export const webRemoteControlRelayLogger = {
    info: (...args: unknown[]) =>
        writeDedicated("web-remote-control-relay", "info", "web-remote-control-relay", ...args),
    warn: (...args: unknown[]) =>
        writeDedicated("web-remote-control-relay", "warn", "web-remote-control-relay", ...args),
    error: (...args: unknown[]) =>
        writeDedicated("web-remote-control-relay", "error", "web-remote-control-relay", ...args),
};
