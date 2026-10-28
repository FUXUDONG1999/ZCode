#!/usr/bin/env node

import process from "node:process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCommand } from "./spawn-command.mjs";
import { clearHoistedPatchedDependencies } from "./bootstrap-patched-dependencies.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, "..");
const gitCommand = "git";
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

// 个人精简：--with-remote 远程资源打包入口随 packages/zcode-server-cli 一并移除，
// bootstrap 只保留 submodule 初始化、依赖安装与本地 workspace 构建。
function runGit(args) {
  runCommand(gitCommand, args, {
    cwd: rootDir,
    env: process.env,
  });
}

function runPnpm(args) {
  runCommand(pnpmCommand, args, {
    cwd: rootDir,
    env: process.env,
  });
}

runGit(["submodule", "update", "--init", "--recursive", "apps/zcode-cli"]);

const clearedPatchedDependencies = await clearHoistedPatchedDependencies({
  rootDir,
  packageJsonPath: resolve(rootDir, "package.json"),
});
if (clearedPatchedDependencies.length > 0) {
  console.log(
    `[bootstrap] refreshed hoisted patched dependencies: ${clearedPatchedDependencies.join(", ")}`,
  );
}

runPnpm(["install"]);

// Desktop runtime 入口只准备本机资源；远程 Source Server 发行物不再本地打包。
runPnpm(["prepare:desktop-runtime"]);
runPnpm(["run", "build:bootstrap"]);
