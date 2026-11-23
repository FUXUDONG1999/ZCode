import { spawn } from "node:child_process";
import { quoteArgsForWindowsShell, resolveSpawnRuntimeOptions } from "./spawn-command.mjs";

// GitHub 托管镜像 2026 年起移除 VS2022、只带 VS2026（actions/runner-images #14017）；
// 生成器不能硬编码，按本机 CMake 支持列表取最新 VS 生成器，找不到回退 2022 保持旧行为。
// 独立成无副作用的叶子模块：入口 shim 脚本会被 wdio.conf.ts 顺着 import 求值，
// 带顶层 await 的 CLI 入口（build-windows-runtime-host.mjs）不能进那张依赖图。
export const DEFAULT_VISUAL_STUDIO_GENERATOR = "Visual Studio 17 2022";
const VISUAL_STUDIO_GENERATOR_PATTERN = /^\s*\*?\s*(Visual Studio (\d+) \d{4})\b/gm;

export function pickVisualStudioGenerator(cmakeHelpOutput) {
  let newest = DEFAULT_VISUAL_STUDIO_GENERATOR;
  let newestMajor = 0;
  for (const match of cmakeHelpOutput.matchAll(VISUAL_STUDIO_GENERATOR_PATTERN)) {
    const major = Number(match[2]);
    if (major > newestMajor) {
      newestMajor = major;
      newest = match[1];
    }
  }
  return newest;
}

// command 传后续 configure/build 用的同一个 CMake，探测结果只对它的支持列表成立。
export async function resolveVisualStudioGenerator(
  command = process.env.CMAKE || "cmake",
  { timeoutMs } = {},
) {
  const runtimeOptions = resolveSpawnRuntimeOptions(command);
  const help = await new Promise((resolveHelp, rejectHelp) => {
    const child = spawn(
      command,
      runtimeOptions.shell ? quoteArgsForWindowsShell(["--help"]) : ["--help"],
      { ...runtimeOptions, stdio: "pipe", timeout: timeoutMs },
    );
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.once("error", rejectHelp);
    child.once("exit", (code) =>
      code === 0 ? resolveHelp(output) : rejectHelp(new Error(`cmake --help failed: ${code}`)),
    );
  });
  return pickVisualStudioGenerator(help);
}
