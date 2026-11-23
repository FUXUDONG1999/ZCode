import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  assertPrebuiltArchiveSha256,
  extractPrebuiltArchive,
  extractPrebuiltBinary,
  resolveWindowsSystemTarPath,
  verifyPrebuiltArchiveSha256,
} from "../prebuilt-binary-extract.mjs";

const isWindows = process.platform === "win32";

// 造档与被测分支共用系统 bsdtar：-a 按扩展名产出 zip。
function createZipArchive(payloadDir, payloadName) {
  const archivePath = join(payloadDir, `${payloadName}.zip`);
  execFileSync(resolveWindowsSystemTarPath(), ["-caf", archivePath, "-C", payloadDir, payloadName]);
  return archivePath;
}

test("归档 SHA-256 参数规整与校验失败", () => {
  const expectedDigest = "a".repeat(64);
  assert.equal(assertPrebuiltArchiveSha256(`  ${expectedDigest} \n`), expectedDigest);
  assert.throws(() => assertPrebuiltArchiveSha256("not-a-digest"));
  assert.throws(() => assertPrebuiltArchiveSha256(undefined));
});

test("verifyPrebuiltArchiveSha256 通过一致摘要并拒绝不匹配摘要", () => {
  const baseDir = mkdtempSync(join(tmpdir(), "zcode-prebuilt-extract-test-"));
  try {
    const archivePath = join(baseDir, "archive.zip");
    writeFileSync(archivePath, "archive bytes");
    const actualDigest = createHash("sha256").update(readFileSync(archivePath)).digest("hex");

    verifyPrebuiltArchiveSha256(archivePath, actualDigest.toUpperCase());
    assert.throws(
      () => verifyPrebuiltArchiveSha256(archivePath, "b".repeat(64)),
      /Archive SHA-256 mismatch/,
    );
  } finally {
    rmSync(baseDir, { recursive: true, force: true });
  }
});

test("win32 zip 归档经系统 bsdtar 解压并保留嵌套结构", { skip: !isWindows }, () => {
  const baseDir = mkdtempSync(join(tmpdir(), "zcode-prebuilt-extract-test-"));
  try {
    const payloadDir = join(baseDir, "payload");
    mkdirSync(join(payloadDir, "nested"), { recursive: true });
    writeFileSync(join(payloadDir, "nested", "ugrep.exe"), "fake binary bytes");
    const archivePath = createZipArchive(baseDir, "payload");

    const extractDir = join(baseDir, "extract");
    extractPrebuiltArchive({ archivePath, archiveExt: "zip", extractDir, cwd: baseDir });

    assert.equal(
      readFileSync(join(extractDir, "payload", "nested", "ugrep.exe"), "utf8"),
      "fake binary bytes",
    );
  } finally {
    rmSync(baseDir, { recursive: true, force: true });
  }
});

test("extractPrebuiltBinary 校验后落位二进制", { skip: !isWindows }, async () => {
  const baseDir = mkdtempSync(join(tmpdir(), "zcode-prebuilt-extract-test-"));
  try {
    writeFileSync(join(baseDir, "ugrep.exe"), "fake binary bytes");
    const archivePath = createZipArchive(baseDir, "ugrep.exe");
    const archiveSha256 = createHash("sha256").update(readFileSync(archivePath)).digest("hex");

    let validateCalls = 0;
    const binaryPath = join(baseDir, "out", "ugrep.exe");
    await extractPrebuiltBinary({
      archiveExt: "zip",
      archivePath,
      archiveSha256,
      binaryName: "ugrep.exe",
      binaryPath,
      cwd: baseDir,
      targetPlatform: "win32",
      validateBinary: async () => {
        validateCalls += 1;
      },
    });

    assert.equal(validateCalls, 1);
    assert.equal(existsSync(binaryPath), true);
    assert.equal(readFileSync(binaryPath, "utf8"), "fake binary bytes");
  } finally {
    rmSync(baseDir, { recursive: true, force: true });
  }
});
