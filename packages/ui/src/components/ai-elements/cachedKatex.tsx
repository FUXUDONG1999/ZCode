import { useMemo } from "react";
import katex from "katex";

const KATEX_HTML_CACHE_LIMIT = 512;
const katexHtmlCache = new Map<string, string>();

/** KaTeX renderToString 单公式毫秒级，错误公式在 throwOnError 策略下还要重跑一遍；
 *  流式期间公式所在 block 每帧重解析，已稳定公式必须命中缓存而非重新渲染。 */
export function renderCachedKatexHtml(latex: string, displayMode: boolean): string {
  const cacheKey = `${displayMode ? "D" : "I"}\u0000${latex}`;
  const cached = katexHtmlCache.get(cacheKey);
  if (cached !== undefined) {
    katexHtmlCache.delete(cacheKey);
    katexHtmlCache.set(cacheKey, cached);
    return cached;
  }
  const html = katex.renderToString(latex, {
    displayMode,
    errorColor: "var(--color-muted-foreground)",
    strict: "ignore",
    throwOnError: false,
  });
  katexHtmlCache.set(cacheKey, html);
  if (katexHtmlCache.size > KATEX_HTML_CACHE_LIMIT) {
    const oldestKey = katexHtmlCache.keys().next().value;
    if (oldestKey !== undefined) katexHtmlCache.delete(oldestKey);
  }
  return html;
}

interface CachedKatexMarkupProps {
  latex: string;
  displayMode: boolean;
}

export function CachedKatexMarkup({ latex, displayMode }: CachedKatexMarkupProps) {
  const html = useMemo(() => renderCachedKatexHtml(latex, displayMode), [latex, displayMode]);
  return (
    <span
      className={displayMode ? "block" : undefined}
      data-zcode-katex
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
