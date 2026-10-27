/**
 * 手写声明的原因：仓库未开启 allowJs，`renderer-only-package-exclusions.mjs` 若缺少本文件，
 * TS 会把它整体当成隐式 any。该模块同时被 electron-builder.config.js（.js，无类型）和
 * bundle.mjs 引用；test/rendererOnlyPackageExclusions.test.ts 通过本文件获得类型。
 * 改 .mjs 导出时必须同步本文件。
 */
/** 已由 vite/tsup 静态打进 out/ 产物、允许从 app.asar 排除的纯前端依赖名单。 */
export declare const RENDERER_ONLY_EXCLUDED_PACKAGES: string[];

/** 生成 electron-builder files 用的 `!node_modules/<pkg>/**` 负向模式列表。 */
export declare function createRendererOnlyPackageExclusionPatterns(): string[];

/**
 * 返回与运行时必需依赖闭包（含传递依赖）相交的排除项；非空代表配置自相矛盾，
 * 打包必须失败。
 */
export declare function findRendererOnlyExclusionRuntimeConflicts(
  excludedPackages: readonly string[],
  closureModuleNames: readonly string[],
): string[];
