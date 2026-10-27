// 打包体积瘦身的排除名单与机械校验。名单中的包都已由 vite/tsup 静态打进 out/ 产物，
// app.asar 里的 node_modules 副本对运行时不可达：
// - renderer 全部窗口 sandbox:true + nodeIntegration:false + contextIsolation:true，
//   无法解析 node_modules，渲染代码只能用 vite 打进 out/renderer 的静态产物；
// - 主进程 tsup external 列表（electron/node-pty/ssh2/undici/@larksuiteoapi/node-sdk/
//   yaml/node-forge/yauzl）不含这些包，即使被 import 也会被内联进 bundle。
// 铁律：tsup external 包及其传递依赖闭包（REQUIRED_ASAR_RUNTIME_MODULES 口径）绝不允许
// 进入本名单。afterPack 会在每次打包时用依赖闭包机械校验冲突，bundle.mjs 会在产物阶段
// 校验排除是否真正生效，两者任一失败都会中断打包。新增条目必须附证据注释
// （chunk 标记 / sourcemap 模块图 / worker-wasm 资产）。

/** @type {string[]} */
export const RENDERER_ONLY_EXCLUDED_PACKAGES = [
  // —— 纯前端渲染依赖（vite 已打进 out/renderer 的 chunk / assets）——
  "echarts", // renderer chunk 内含 echarts 运行时代码
  "mermaid", // renderer 懒加载 chunk 内含 mermaid 运行时代码
  // pdf.worker 与 cmaps 已由 vite 产出（out/renderer/assets/pdf.worker.min-*.mjs、out/renderer/pdfjs/cmaps）
  "pdfjs-dist",
  "lottie-web", // renderer chunk 内含 lottie 运行时代码
  "@extend-ai/react-xlsx", // xlsx-worker chunk 与 duke_sheets wasm 资产已由 vite 产出
  "world-atlas", // countries-50m.json 已进 vite 模块图（sourcemap sources 可见）
  "@shikijs/langs", // 语法文件已进 renderer chunk（tmLanguage 标记）
  "lucide-react", // 数百个 renderer 源文件静态 import，tree-shake 后进 chunk
  "highlight.js", // 已进 vite 模块图
  "@extend-ai/react-docx", // docx-import-worker chunk 与 docx wasm 资产已由 vite 产出
  "@dukelib/sheets-wasm", // duke_sheets_wasm_bg-*.wasm 已作为 vite 资产产出
  "katex", // 19 个 KaTeX woff2 字体已作为 vite 资产产出
  "media-chrome",
  "recharts",
  // —— 主进程运行时代码已被 tsup 内联进 out/main，node_modules 副本同样不可达 ——
  // 注意：@arms/rum-electron 运行时动态 require 的 @babel/runtime 不在本名单，
  // 仍由 REQUIRED_ASAR_RUNTIME_MODULES 保证随包。
  "@arms/rum-electron",
  "zod", // services 静态 import，随 noExternal 内联进 out/main（ZodError 标记）
  "ai", // 随 @zcode/client/services 内联进 out/main（generateText 标记）
  "rrweb", // 全仓源码与 vite 产物均无引用，属遗留死依赖
];

export function createRendererOnlyPackageExclusionPatterns() {
  return RENDERER_ONLY_EXCLUDED_PACKAGES.map((packageName) => `!node_modules/${packageName}/**`);
}

/**
 * 返回与运行时必需依赖闭包相交的排除项。非空即代表配置自相矛盾：
 * files 把包排除了，主进程却要在运行时 require 它，安装包会"能打出但启动即崩"。
 */
export function findRendererOnlyExclusionRuntimeConflicts(excludedPackages, closureModuleNames) {
  const closureModuleNamesSet = new Set(closureModuleNames);
  return excludedPackages.filter((packageName) => closureModuleNamesSet.has(packageName));
}
