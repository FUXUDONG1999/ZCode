import assert from "node:assert/strict";
import { test } from "node:test";
import {
  pickVisualStudioGenerator,
  resolveRuntimeHostBuild,
  verifyRuntimeHostPe,
} from "../build-windows-runtime-host.mjs";

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
