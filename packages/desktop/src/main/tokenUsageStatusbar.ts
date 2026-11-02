import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { app } from "electron";

const nodeRequire = createRequire(import.meta.url);

const TOKEN_STATUSBAR_DISABLE_ENVIRONMENT_VARIABLE = "ZCODE_TOKEN_STATUSBAR_DISABLE";
const TOKEN_STATUSBAR_RESOURCE_DIRECTORY_NAME = "token-usage-statusbar";
const TOKEN_STATUSBAR_RUNTIME_DIRECTORY_NAME = "zcode-token-usage-statusbar";
const SEED_RECORD_FILE_NAME = "fork-seed.json";
/** LICENSE/NOTICE 只随安装包分发，不进运行目录，其余文件即上游 install.py 的 RUNTIME_FILES 语义。 */
const NON_RUNTIME_SEED_FILE_NAMES = new Set(["LICENSE", "NOTICE"]);
/** 首次运行的最小默认配置：自更新关闭（版本由 fork 构建掌控），缺省键由插件运行时自行兜底。 */
const DEFAULT_RUNTIME_CONFIGURATION = `${JSON.stringify(
  { lang: "zh", plugin_auto_update: false },
  null,
  2,
)}\n`;

export interface TokenUsageStatusbarInstallResult {
  seededFileCount: number;
  upgradedFileCount: number;
  preservedFileCount: number;
  runtimeLoaded: boolean;
}

interface SeedRecord {
  files: Record<string, string>;
}

function computeSha256(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

async function writeAtomically(targetPath: string, content: string | Buffer): Promise<void> {
  const temporaryPath = `${targetPath}.tmp-${process.pid}`;
  await writeFile(temporaryPath, content);
  await rename(temporaryPath, targetPath);
}

/** 生产走包内 extraResources；dev 走仓库 resources 目录。 */
export function resolveTokenUsageStatusbarSeedDirectory(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, TOKEN_STATUSBAR_RESOURCE_DIRECTORY_NAME)
    : path.join(
        import.meta.dirname,
        "..",
        "..",
        "resources",
        TOKEN_STATUSBAR_RESOURCE_DIRECTORY_NAME,
      );
}

/** CLI 用户资源（config/db）始终在真实 HOME，不随 dataBaseDir 迁移（docs/desktop/configurable-data-directory.md）。 */
export function resolveTokenUsageStatusbarRuntimeDirectory(): string {
  return path.join(homedir(), ".zcode", TOKEN_STATUSBAR_RUNTIME_DIRECTORY_NAME);
}

function loadRuntimeFromDirectory(runtimeDirectory: string): void {
  nodeRequire(path.join(runtimeDirectory, "inject-main.cjs"));
}

/**
 * 个人定制：token 用量状态条的种子同步与原生加载（spec：docs/desktop/token-usage-statusbar.md）。
 * 同步规则按运行目录内 fork-seed.json 记录的哈希判定归属：目标缺失或仍是 fork 上次
 * 写入的内容才覆盖（升级），用户/插件改过的文件保留不动；config.json 永不触碰。
 * 任何失败只记日志，绝不阻断启动。
 */
export async function installTokenUsageStatusbar(options: {
  logger: { info: (...args: unknown[]) => void; warn: (...args: unknown[]) => void };
  seedDirectory?: string;
  runtimeDirectory?: string;
  loadRuntime?: (runtimeDirectory: string) => void;
}): Promise<TokenUsageStatusbarInstallResult> {
  const skipped = {
    seededFileCount: 0,
    upgradedFileCount: 0,
    preservedFileCount: 0,
    runtimeLoaded: false,
  };
  if (process.env[TOKEN_STATUSBAR_DISABLE_ENVIRONMENT_VARIABLE] === "1") {
    options.logger.info("[token-statusbar] disabled by environment variable");
    return skipped;
  }

  try {
    const seedDirectory = options.seedDirectory ?? resolveTokenUsageStatusbarSeedDirectory();
    const runtimeDirectory =
      options.runtimeDirectory ?? resolveTokenUsageStatusbarRuntimeDirectory();
    if (!existsSync(seedDirectory)) {
      options.logger.warn("[token-statusbar] seed directory missing, skip:", seedDirectory);
      return skipped;
    }

    const seedFileNames = (await readdir(seedDirectory)).filter(
      (fileName) => !fileName.startsWith(".") && !NON_RUNTIME_SEED_FILE_NAMES.has(fileName),
    );
    await mkdir(runtimeDirectory, { recursive: true });

    const seedRecordPath = path.join(runtimeDirectory, SEED_RECORD_FILE_NAME);
    const seedRecordFileExists = existsSync(seedRecordPath);
    let record: SeedRecord = { files: {} };
    if (seedRecordFileExists) {
      try {
        const parsed = JSON.parse(await readFile(seedRecordPath, "utf8")) as Partial<SeedRecord>;
        if (
          parsed &&
          typeof parsed === "object" &&
          parsed.files &&
          typeof parsed.files === "object"
        ) {
          record = { files: parsed.files as Record<string, string> };
        }
      } catch {
        // 记录损坏时按“全部用户所有”处理，不接手任何已存在文件
        options.logger.warn("[token-statusbar] seed record unreadable, preserve existing files");
      }
    }

    const nextRecordFiles: Record<string, string> = {};
    let seededFileCount = 0;
    let upgradedFileCount = 0;
    let preservedFileCount = 0;
    for (const fileName of seedFileNames) {
      const seedContent = await readFile(path.join(seedDirectory, fileName));
      const seedHash = computeSha256(seedContent);
      const targetPath = path.join(runtimeDirectory, fileName);
      if (existsSync(targetPath)) {
        const targetHash = computeSha256(await readFile(targetPath));
        const recordedHash = record.files[fileName];
        // 无记录条目时仅首次接管（记录文件不存在，如 install.py 装过的旧运行目录）；
        // 已有记录文件的场合缺条目视为用户所有，避免误覆盖。
        const forkOwned =
          recordedHash !== undefined ? targetHash === recordedHash : !seedRecordFileExists;
        if (!forkOwned) {
          preservedFileCount += 1;
          continue;
        }
        if (seedHash === targetHash) {
          nextRecordFiles[fileName] = seedHash;
          continue;
        }
        upgradedFileCount += 1;
      } else {
        seededFileCount += 1;
      }
      await writeAtomically(targetPath, seedContent);
      nextRecordFiles[fileName] = seedHash;
    }
    await writeAtomically(
      seedRecordPath,
      `${JSON.stringify({ files: nextRecordFiles }, null, 2)}\n`,
    );

    const configurationPath = path.join(runtimeDirectory, "config.json");
    if (!existsSync(configurationPath)) {
      await writeAtomically(configurationPath, DEFAULT_RUNTIME_CONFIGURATION);
    }

    let runtimeLoaded = false;
    try {
      (options.loadRuntime ?? loadRuntimeFromDirectory)(runtimeDirectory);
      runtimeLoaded = true;
    } catch (error) {
      options.logger.warn("[token-statusbar] failed to load runtime:", error);
    }
    options.logger.info("[token-statusbar] runtime ready", {
      seeded: seededFileCount,
      upgraded: upgradedFileCount,
      preserved: preservedFileCount,
      runtimeLoaded,
    });
    return { seededFileCount, upgradedFileCount, preservedFileCount, runtimeLoaded };
  } catch (error) {
    options.logger.warn("[token-statusbar] install failed:", error);
    return skipped;
  }
}
