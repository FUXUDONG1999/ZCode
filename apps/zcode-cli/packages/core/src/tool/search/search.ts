import { TOOL_SEARCH_DEFAULT_RESULTS, type ToolSearchCandidate } from "@zcode/contracts";
import { toModelVisibleMcpNamePart } from "../../mcp/name.js";

function tokenize(tool: ToolSearchCandidate) {
  const name = tool.name;
  const mcp = tool.mcp
    ? [name, tool.mcp.serverName, tool.mcp.toolName]
    : /^mcp__(.+?)__(.+)$/.exec(name);
  const coarse = mcp ? [mcp[1]!, mcp[2]!].map((s) => s.toLowerCase()) : [name.toLowerCase()];
  const parts = mcp
    ? coarse.flatMap((s) => s.split(/[\s_.]+/)).filter(Boolean)
    : name
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replaceAll("_", " ")
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);
  return { coarse, parts, full: parts.join(" "), mcp: Boolean(mcp) };
}

function resolveName(name: string, catalog: readonly ToolSearchCandidate[]) {
  return catalog.find((tool) => tool.name === name || tool.aliases?.includes(name));
}

export function searchTools(
  query: string,
  catalog: readonly ToolSearchCandidate[],
  maxResults = TOOL_SEARCH_DEFAULT_RESULTS,
): string[] {
  const deferred = catalog.filter((tool) => tool.deferred);
  const select = /^select:(.+)$/i.exec(query);
  if (select)
    return [
      ...new Set(
        select[1]!.split(",").flatMap((value) => {
          const name = value.trim();
          const exact = resolveName(name, deferred) ?? resolveName(name, catalog);
          if (exact) return [exact.name];
          return catalog
            .filter(
              (tool) =>
                tool.mcp &&
                (tool.mcp.toolName === name ||
                  toModelVisibleMcpNamePart(tool.mcp.toolName) === name),
            )
            .map((tool) => tool.name);
        }),
      ),
    ];
  const text = query.toLowerCase().trim();
  const exact =
    deferred.find((tool) => tool.name.toLowerCase() === text) ??
    catalog.find((tool) => tool.name.toLowerCase() === text);
  if (exact) return [exact.name];
  if (text.startsWith("mcp__") && text.length > 5) {
    const names = deferred
      .filter((tool) => tool.name.toLowerCase().startsWith(text))
      .slice(0, maxResults)
      .map((tool) => tool.name);
    if (names.length > 0) return names;
  }
  const terms = text.split(/\s+/).filter(Boolean);
  const required = terms
    .filter((term) => term.startsWith("+") && term.length > 1)
    .map((term) => term.slice(1));
  const keywords =
    required.length > 0
      ? [...required, ...terms.filter((term) => !(term.startsWith("+") && term.length > 1))]
      : terms;
  const patterns = new Map(
    keywords.map((term) => [
      term,
      new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`),
    ]),
  );
  return deferred
    .map((tool) => {
      const name = tokenize(tool);
      const description = tool.description?.toLowerCase() ?? "";
      const hint = tool.searchHint?.toLowerCase() ?? "";
      if (
        !required.every(
          (term) =>
            name.parts.some((part) => part.includes(term)) ||
            name.coarse.some((part) => part.includes(term)) ||
            patterns.get(term)!.test(description) ||
            patterns.get(term)!.test(hint),
        )
      )
        return { name: tool.name, score: 0 };
      let score = 0;
      for (const term of keywords) {
        if (name.parts.includes(term)) score += name.mcp ? 12 : 10;
        else if (name.parts.some((part) => part.includes(term))) score += name.mcp ? 6 : 5;
        if (name.coarse.includes(term)) score += name.mcp ? 12 : 10;
        else if (name.coarse.some((part) => part.includes(term))) score += name.mcp ? 4 : 3;
        if (name.full.includes(term) && score === 0) score += 3;
        if (hint && patterns.get(term)!.test(hint)) score += 4;
        if (patterns.get(term)!.test(description)) score += 2;
      }
      return { name: tool.name, score };
    })
    .filter((tool) => tool.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map((tool) => tool.name);
}

// 原因：关键词路径只搜 deferred 工具，查询撞上常驻工具（实测 GLM 用 "^Read$" 搜 Read）
// 会返回空，模型据此误报"没有该工具"并继续无效搜索。no-match 回执里改用查询原文
// 对常驻工具名做正则/子串匹配，命中即提示直接调用。
export function searchResidentTools(
  query: string,
  catalog: readonly ToolSearchCandidate[],
  maxResults = TOOL_SEARCH_DEFAULT_RESULTS,
): string[] {
  const text = query.trim();
  if (text.length === 0) return [];
  let matchesName: (name: string) => boolean;
  try {
    const pattern = new RegExp(text, "i");
    matchesName = (name) => pattern.test(name);
  } catch {
    const lowered = text.toLowerCase();
    matchesName = (name) => name.toLowerCase().includes(lowered);
  }
  return catalog
    .filter((tool) => !tool.deferred)
    .filter((tool) => matchesName(tool.name) || tool.aliases?.some(matchesName))
    .map((tool) => tool.name)
    .slice(0, maxResults);
}
