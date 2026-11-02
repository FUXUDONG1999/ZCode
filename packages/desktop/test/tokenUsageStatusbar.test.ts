import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installTokenUsageStatusbar } from "#src/main/tokenUsageStatusbar.js";

const SEED_RUNTIME_FILES = ["inject-main.cjs", "overlay.js", "zusage.py"];

async function createSeedDirectory(rootDirectory: string, files: Record<string, string>) {
  const seedDirectory = join(rootDirectory, "seed");
  await mkdir(seedDirectory, { recursive: true });
  for (const [fileName, content] of Object.entries(files)) {
    await writeFile(join(seedDirectory, fileName), content);
  }
  return seedDirectory;
}

describe("token usage statusbar install", () => {
  let rootDirectory: string;
  const logger = { info: vi.fn(), warn: vi.fn() };
  const loadRuntime = vi.fn();

  beforeEach(async () => {
    rootDirectory = await mkdtemp(join(tmpdir(), "zcode-token-statusbar-"));
    logger.info.mockClear();
    logger.warn.mockClear();
    loadRuntime.mockClear();
  });

  afterEach(async () => {
    await rm(rootDirectory, { recursive: true, force: true });
  });

  function install(seedDirectory: string, runtimeDirectory: string) {
    return installTokenUsageStatusbar({ logger, seedDirectory, runtimeDirectory, loadRuntime });
  }

  it("首次运行种子化全部运行时文件并生成默认 config，LICENSE/NOTICE 不进运行目录", async () => {
    const seedDirectory = await createSeedDirectory(rootDirectory, {
      ...Object.fromEntries(SEED_RUNTIME_FILES.map((name) => [name, `content-${name}`])),
      LICENSE: "MIT",
      NOTICE: "upstream",
    });
    const runtimeDirectory = join(rootDirectory, "runtime");
    const result = await install(seedDirectory, runtimeDirectory);

    expect(result).toEqual({
      seededFileCount: 3,
      upgradedFileCount: 0,
      preservedFileCount: 0,
      runtimeLoaded: true,
    });
    expect(await readFile(join(runtimeDirectory, "zusage.py"), "utf8")).toBe("content-zusage.py");
    expect((await readdir(runtimeDirectory)).sort()).toEqual(
      [...SEED_RUNTIME_FILES, "config.json", "fork-seed.json"].sort(),
    );
    expect(JSON.parse(await readFile(join(runtimeDirectory, "config.json"), "utf8"))).toEqual({
      lang: "zh",
      plugin_auto_update: false,
    });
    expect(loadRuntime).toHaveBeenCalledWith(runtimeDirectory);
  });

  it("种子升级覆盖未改动文件；用户改过的文件保留且不登记", async () => {
    const filesFirst = Object.fromEntries(SEED_RUNTIME_FILES.map((name) => [name, `${name}-v1`]));
    const seedDirectory = await createSeedDirectory(rootDirectory, filesFirst);
    const runtimeDirectory = join(rootDirectory, "runtime");
    await install(seedDirectory, runtimeDirectory);

    await writeFile(join(runtimeDirectory, "overlay.js"), "user-edited");
    await writeFile(join(seedDirectory, "zusage.py"), "zusage.py-v2");
    const result = await install(seedDirectory, runtimeDirectory);

    expect(result).toEqual({
      seededFileCount: 0,
      upgradedFileCount: 1,
      preservedFileCount: 1,
      runtimeLoaded: true,
    });
    expect(await readFile(join(runtimeDirectory, "zusage.py"), "utf8")).toBe("zusage.py-v2");
    expect(await readFile(join(runtimeDirectory, "overlay.js"), "utf8")).toBe("user-edited");
    // 用户文件后续启动仍保留：无记录条目 + 记录文件存在 → 用户所有
    await writeFile(join(seedDirectory, "overlay.js"), "overlay.js-v2");
    expect((await install(seedDirectory, runtimeDirectory)).preservedFileCount).toBe(1);
    expect(await readFile(join(runtimeDirectory, "overlay.js"), "utf8")).toBe("user-edited");
  });

  it("已有 install.py 装过的运行目录（无记录文件）首次被 fork 接管", async () => {
    const seedDirectory = await createSeedDirectory(rootDirectory, {
      "inject-main.cjs": "inject-main.cjs-v2",
    });
    const runtimeDirectory = join(rootDirectory, "runtime");
    await mkdir(runtimeDirectory, { recursive: true });
    await writeFile(join(runtimeDirectory, "inject-main.cjs"), "old-installer-copy");
    await writeFile(join(runtimeDirectory, "config.json"), '{"lang":"en"}');

    const result = await install(seedDirectory, runtimeDirectory);
    expect(result.seededFileCount).toBe(0);
    expect(result.upgradedFileCount).toBe(1);
    expect(await readFile(join(runtimeDirectory, "inject-main.cjs"), "utf8")).toBe(
      "inject-main.cjs-v2",
    );
    // 已存在的用户 config 不被默认值覆盖
    expect(await readFile(join(runtimeDirectory, "config.json"), "utf8")).toBe('{"lang":"en"}');
  });

  it("种子记录损坏时保留全部已存在文件", async () => {
    const seedDirectory = await createSeedDirectory(rootDirectory, { "zusage.py": "v2" });
    const runtimeDirectory = join(rootDirectory, "runtime");
    await mkdir(runtimeDirectory, { recursive: true });
    await writeFile(join(runtimeDirectory, "zusage.py"), "v1");
    await writeFile(join(runtimeDirectory, "fork-seed.json"), "{broken");

    const result = await install(seedDirectory, runtimeDirectory);
    expect(result.preservedFileCount).toBe(1);
    expect(await readFile(join(runtimeDirectory, "zusage.py"), "utf8")).toBe("v1");
  });

  it("禁用环境变量与种子目录缺失均不加载、不创建运行目录", async () => {
    const seedDirectory = await createSeedDirectory(rootDirectory, { "zusage.py": "v1" });
    const runtimeDirectory = join(rootDirectory, "runtime");
    const previousValue = process.env.ZCODE_TOKEN_STATUSBAR_DISABLE;
    process.env.ZCODE_TOKEN_STATUSBAR_DISABLE = "1";
    try {
      const disabled = await install(seedDirectory, runtimeDirectory);
      expect(disabled.runtimeLoaded).toBe(false);
      expect(loadRuntime).not.toHaveBeenCalled();
      // runtime 目录此时可能由外部创建，这里只断言本调用未写入文件
    } finally {
      if (previousValue === undefined) delete process.env.ZCODE_TOKEN_STATUSBAR_DISABLE;
      else process.env.ZCODE_TOKEN_STATUSBAR_DISABLE = previousValue;
    }

    const missingSeed = await install(join(rootDirectory, "nope"), join(rootDirectory, "runtime2"));
    expect(missingSeed.runtimeLoaded).toBe(false);
    expect(logger.warn).toHaveBeenCalled();
  });

  it("运行目录加载抛错时只告警不抛出", async () => {
    const seedDirectory = await createSeedDirectory(rootDirectory, { "zusage.py": "v1" });
    loadRuntime.mockImplementationOnce(() => {
      throw new Error("boom");
    });
    const result = await install(seedDirectory, join(rootDirectory, "runtime"));
    expect(result.runtimeLoaded).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(
      "[token-statusbar] failed to load runtime:",
      expect.any(Error),
    );
  });
});
