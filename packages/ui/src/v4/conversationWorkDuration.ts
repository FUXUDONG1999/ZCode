import type { Locale } from "@zcode/shared";
import type { IntlInstance } from "@/i18n/IntlProvider.js";

function formatDurationUnit(
    value: number,
    messageId: string,
    intl: IntlInstance,
    locale: Locale,
): string {
    const unit = intl.formatMessage({ id: messageId });
    // 中文时长单位需要空格；英文单位本身已带缩写，不额外插入空格。
    return `${value}${locale === "zh-CN" ? " " : ""}${unit}`;
}

/** Desktop 与 Share 共用的工作时长文案，避免同一轮在两个 surface 显示不同单位。 */
export function formatConversationWorkDuration(
    durationMs: number | undefined,
    intl: IntlInstance,
    locale: Locale,
): string | null {
    if (durationMs === undefined) return null;

    const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
    const days = Math.floor(totalSeconds / 86_400);
    const hours = Math.floor((totalSeconds % 86_400) / 3_600);
    const minutes = Math.floor((totalSeconds % 3_600) / 60);
    const seconds = totalSeconds % 60;
    const parts: string[] = [];

    if (days > 0) parts.push(formatDurationUnit(days, "chat.history.duration.day", intl, locale));
    if (hours > 0)
        parts.push(formatDurationUnit(hours, "chat.history.duration.hour", intl, locale));
    if (minutes > 0)
        parts.push(formatDurationUnit(minutes, "chat.history.duration.minute", intl, locale));
    if (seconds > 0 || parts.length === 0) {
        parts.push(formatDurationUnit(seconds, "chat.history.duration.second", intl, locale));
    }

    return parts.slice(0, 2).join(" ");
}

/** 每轮 token 生成速度（tok/s）的统一写法：≥ 10 取整，< 10 保留 1 位小数；单位与 locale 无关。 */
export function formatConversationTokensPerSecond(
    tokensPerSecond: number | undefined,
): string | null {
    if (
        tokensPerSecond === undefined ||
        !Number.isFinite(tokensPerSecond) ||
        tokensPerSecond <= 0
    ) {
        return null;
    }
    const rounded =
        tokensPerSecond >= 10 ? Math.round(tokensPerSecond) : Math.round(tokensPerSecond * 10) / 10;
    return `${rounded} tok/s`;
}

/**
 * 从协议事实推导每轮生成速度（tok/s）。口径：outputTokens ÷ generationDurationMs
 * （净生成时长，CLI 已扣除首 token 等待），与调试面板 calculateOutputTps 一致；
 * 任一事实缺失或非正时返回 undefined，调用方不展示。
 */
export function deriveConversationTokensPerSecond(
    facts: { outputTokens?: number; generationDurationMs?: number } | null | undefined,
): number | undefined {
    const { outputTokens, generationDurationMs } = facts ?? {};
    if (
        outputTokens === undefined ||
        outputTokens <= 0 ||
        generationDurationMs === undefined ||
        generationDurationMs <= 0
    ) {
        return undefined;
    }
    return (outputTokens * 1000) / generationDurationMs;
}
