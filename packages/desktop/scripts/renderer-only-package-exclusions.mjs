// 打包体积瘦身的排除名单与机械校验。名单中的包都已由 vite/tsup 静态打进 out/ 产物，
// app.asar 里的 node_modules 副本对运行时不可达：
// - renderer 全部窗口 sandbox:true + nodeIntegration:false + contextIsolation:true，
//   无法解析 node_modules，渲染代码只能用 vite 打进 out/renderer 的静态产物；
// - 主进程侧这些包都不在 desktop package.json dependencies 里被 tsup 默认外置：
//   要么是纯 renderer 依赖，要么只是内联 workspace 包（services/client）的传递依赖，
//   随 noExternal 一起被打进 out/main。
// 铁律：tsup 运行时外置的包绝不允许进入本名单——desktop package.json dependencies
// 会被 tsup 默认外置并在 out/main 保留裸 import，裁出 app.asar 即"能打出但启动即崩"。
// afterPack 会在每次打包时用依赖闭包机械校验冲突，bundle.mjs 会在产物阶段
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
    // 教训（2026-10 打包回归）：@arms/rum-electron 曾被误加进本名单，理由是"已被 tsup
    // 内联"——实际它是 desktop dependencies，tsup 默认外置，out/main 保留 6 处裸 import，
    // 裁包后安装包主进程启动即报 ERR_MODULE_NOT_FOUND（asar 里只剩 rum-browser/rum-core）。
    // 它已改为随 REQUIRED_ASAR_RUNTIME_MODULES 注入，afterPack 冲突校验会拦住再次误加。
    "zod", // services 静态 import，随 noExternal 内联进 out/main（ZodError 标记）
    "ai", // 随 @zcode/client/services 内联进 out/main（generateText 标记）
    // 教训（2026-10 打包回归）：rrweb 曾被当作"全仓无引用的死依赖"裁掉——判断时只查了
    // 应用源码，漏了依赖内部：它是 @arms/rum-browser 的直接依赖（会话回放录制），
    // 随 rum-browser 一起进 app.asar 运行。与 @arms/rum-electron 一并纳入
    // REQUIRED_ASAR_RUNTIME_MODULES 闭包后，afterPack 冲突校验拦住了这次误裁。
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
