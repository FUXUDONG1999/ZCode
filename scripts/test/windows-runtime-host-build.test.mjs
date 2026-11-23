import assert from "node:assert/strict";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { resolveRuntimeHostBuild, verifyRuntimeHostPe } from "../build-windows-runtime-host.mjs";
import {
  pickVisualStudioGenerator,
  resolveVisualStudioGenerator,
} from "../windows-visual-studio-generator.mjs";

// 可执行的假 CMake：给了 help 就只应答 --help，没给则一直不退出（10 秒后自杀，不留孤儿进程）。
async function fakeCmake(context, help) {
  const directory = await mkdtemp(join(tmpdir(), "vs-generator-probe-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const script = join(directory, "fake-cmake.mjs");
  const body = help
    ? `if (process.argv[2] !== "--help") process.exit(9);\nconsole.log(${JSON.stringify(help)});`
    : "setInterval(() => {}, 1000);\nsetTimeout(() => process.exit(0), 10_000);";
  await writeFile(script, `#!/usr/bin/env node\n${body}\n`);
  await chmod(script, 0o755);
  if (process.platform !== "win32") return script;
  const wrapper = join(directory, "fake-cmake.cmd");
  await writeFile(wrapper, `@"${process.execPath}" "${script}" %*\r\n`);
  return wrapper;
}

test("Windows builds both supported architectures with the matching MSVC target", () => {
  assert.deepEqual(resolveRuntimeHostBuild("x64", "win32").configureArgs, [
    "-G",
    "Visual Studio 17 2022",
    "-A",
    "x64",
  ]);
  assert.deepEqual(resolveRuntimeHostBuild("arm64", "win32").configureArgs, [
    "-G",
    "Visual Studio 17 2022",
    "-A",
    "ARM64",
  ]);
  assert.throws(() => resolveRuntimeHostBuild("ia32", "win32"), /architecture/);
});
test("Windows builds accept the generator probed on the host", () => {
  assert.deepEqual(
    resolveRuntimeHostBuild("x64", "win32", undefined, "Visual Studio 18 2026").configureArgs,
    ["-G", "Visual Studio 18 2026", "-A", "x64"],
  );
});
test("generator probe picks the newest Visual Studio and falls back to 2022", () => {
  const helpWith2026 = [
    "Generators",
    "  Visual Studio 16 2019        = ...",
    "* Visual Studio 17 2022        = ...",
    "* Visual Studio 18 2026        = ...",
    "* Ninja                        = ...",
  ].join("\n");
  assert.equal(pickVisualStudioGenerator(helpWith2026), "Visual Studio 18 2026");
  const helpWith2022Only = [
    "Generators",
    "* Visual Studio 17 2022        = ...",
    "* Ninja                        = ...",
  ].join("\n");
  assert.equal(pickVisualStudioGenerator(helpWith2022Only), "Visual Studio 17 2022");
  assert.equal(pickVisualStudioGenerator("no generators here"), "Visual Studio 17 2022");
});
test("generator probe asks the given CMake instead of the configured one", async (context) => {
  const command = await fakeCmake(context, "* Visual Studio 17 2022\n* Visual Studio 18 2026\n");
  const configured = process.env.CMAKE;
  process.env.CMAKE = join(tmpdir(), "missing-cmake");
  context.after(() => {
    if (configured === undefined) delete process.env.CMAKE;
    else process.env.CMAKE = configured;
  });
  assert.equal(await resolveVisualStudioGenerator(command), "Visual Studio 18 2026");
});
test("generator probe gives up once its time budget runs out", async (context) => {
  const command = await fakeCmake(context);
  await assert.rejects(
    resolveVisualStudioGenerator(command, { timeoutMs: 300 }),
    /cmake --help failed/,
  );
});
test("cross builds explicitly select a Windows compiler", () => {
  assert.ok(
    resolveRuntimeHostBuild("x64", "linux").configureArgs.includes("-DCMAKE_SYSTEM_NAME=Windows"),
  );
  assert.ok(
    resolveRuntimeHostBuild("arm64", "linux", "example-clang++").configureArgs.includes(
      "-DCMAKE_CXX_COMPILER=example-clang++",
    ),
  );
});
test("packaging rejects wrong-architecture and corrupt PE binaries", () => {
  const bytes = Buffer.alloc(128);
  bytes.write("MZ");
  bytes.writeUInt32LE(64, 60);
  bytes.write("PE\0\0", 64);
  bytes.writeUInt16LE(0x8664, 68);
  verifyRuntimeHostPe(bytes, "x64");
  assert.throws(() => verifyRuntimeHostPe(bytes, "arm64"), /architecture/);
  assert.throws(() => verifyRuntimeHostPe(Buffer.from("bad"), "x64"), /PE/);
});
