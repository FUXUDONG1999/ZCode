export function createBashProviderDescription(input: {
    defaultTimeoutMs: number;
    embeddedSearchEnabled?: boolean;
    maxTimeoutMs: number;
}): string {
    const avoidCommands = input.embeddedSearchEnabled
        ? "`cat`, `head`, `tail`, `sed`, `awk`, or `echo`"
        : "`find`, `grep`, `cat`, `head`, `tail`, `sed`, `awk`, or `echo`";

    return [
        "Executes a bash command and returns its output.",
        "",
        "- Working directory persists between calls, but prefer absolute paths — `cd` in a compound command can trigger a permission prompt. Shell state (env vars, functions) does not persist; the shell is initialized from the user's profile.",
        `- IMPORTANT: Avoid using this tool to run ${avoidCommands} commands, unless explicitly instructed or after you have verified that a dedicated tool cannot accomplish your task. Instead, use the appropriate dedicated tool as this will provide a much better experience for the user.`,
        `- \`timeout\` is in milliseconds: default ${input.defaultTimeoutMs}, max ${input.maxTimeoutMs}.`,
        "- `run_in_background` runs the command detached: it keeps running across turns and re-invokes you when it exits. No `&` needed.",
        // 原因：调查类任务（git status/log/diff 等）逐轮单发会为每条命令多付一次模型往返；
        // 指引模型把相互独立的命令在同一轮以多个 tool call 打包发出。
        "- Issue independent commands (e.g. `git status`, `git log`, and `git diff` during an investigation) as multiple tool calls in the same response rather than one per turn — each extra round trip adds visible latency for the user.",
        "",
        "# Git",
        "- Interactive flags (`-i`, e.g. `git rebase -i`, `git add -i`) are not supported in this environment.",
        "- Use the `gh` CLI for GitHub operations (PRs, issues, API).",
        "- Commit or push only when the user asks. If on the default branch, branch first.",
    ].join("\n");
}
