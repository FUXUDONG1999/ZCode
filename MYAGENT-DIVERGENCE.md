# MyAgent v2 相对上游 main 的有意偏离清单

> 本文件是 `personal/myagent-v2` 的同步裁决手册：每次从 main 合并遇到冲突时，按本清单
> 判断该文件「跟随上游」还是「持有本地」。清单之外的原则：**能跟随上游就跟随上游**。
>
> 功能级的详细档案（每个功能的意图/改动点/适配决策/验证锚点/同步先例）见
> [MYAGENT-FEATURES.md](./MYAGENT-FEATURES.md)；本文是文件级的速查表。
>
> v2 重建原则：新增文件 > 小幅修改上游文件 > 永不删除上游文件（当前仅 4 个删除：品牌
> 资产 Z.svg 与 3 个已移除功能的 manual-review 测试）。不做全仓库重排版，不删测试与文档。

## 1. 品牌（MyAgent / A 字标）— 持有本地

| 路径 | 内容 | 同步策略 |
| --- | --- | --- |
| `packages/desktop/scripts/desktop-product-identity.mjs`、`desktopRuntimeEnv.ts`、`about.ts` 等桌面身份文件 | 产品名 xudong→MyAgent（构建身份、关于页、协议头） | 上游新增品牌文案时改完跑 `desktopProductIdentity.test.ts`；新增文件里的品牌串在每次同步后 grep `ZCode` 增量替换 |
| `public/logo/icons/*`、`packages/desktop/build/icon*`、`packages/ui/src/assets/` | 靛蓝紫渐变 A 字标图标 | 二进制冲突时直接取本地版本（`git checkout --ours`） |
| `packages/ui/src/i18n/locales/{zh-CN,en-US}.ts`、web 展示文案 | 用户可见文案中的品牌串 | 冲突块逐条取本地品牌串、保留上游新增键（先例见 9af88442 重放） |
| `apps/zcode-cli/packages/bootstrap/.../product-projection.ts`、协议行 | 协议/产品投影中的名称 | 小 diff，持有本地 |

## 2. 桌面 UI 定制 — 持有本地（小 diff）

| 路径 | 内容 | 同步策略 |
| --- | --- | --- |
| `packages/ui/src/project-sidebar/ProjectSidebarNavigation.tsx` | 侧边栏只留新建任务+远控设备头，无自动化/插件入口 | 上游在此新增入口时：新功能默认保留，仅维持已有入口的移除 |
| `packages/ui/src/project-sidebar/ProjectNodeContent.tsx`、`ProjectTaskRows.tsx` | 移除「查看文件」入口（showFiles/onOpenFileTree 不下发） | 上游 `chronological` 等新机制跟随上游 |
| `packages/ui/src/FileManagerPane.tsx`（新增） | 侧面板文件预览仅内容、无目录树 | 上游重构 WorkspaceFileTree 时本文件不受影响 |
| `packages/ui/src/app-shell/AnimatedSidePanePanel.tsx`、`WorkspaceShellLayout.tsx`、`hooks/useAppPanels.ts` | 面板按需放回（子 agent/调用轨迹/文件预览）；不再传递 onNavigateFileManager | 上游新增面板类型时正常合入 |
| `packages/ui/src/SettingsPage.tsx`、账户菜单、任务页 | 移除推荐/帮助/邀请入口，One Dark Pro 配色 | 上游「职业引导」为新增功能已跟随上游保留（决策点：如不想要可移除 onOpenOnboardingDialog 一处） |
| `desktopWindowChrome.ts`、`WindowsTopLeftLogo.tsx` | 窗口控制按钮右上角固定、品牌角标 | 持有本地 |
| `packages/desktop/src/main/logger.ts` | 主进程日志异步批量落盘（perf） | 上游改日志格式时注意 `ensureLogDirectory`/退出兜底链路 |
| `editors.ts`、`openInEditor.ts` | JetBrains 全家桶检测、Toolbox 识别、`--line` 定位 | 上游演进跟随上游，保留新增编辑器条目 |

**注意**：上游 `packages/ui/src/WorkspaceFileTree.tsx` 与 `workspace-file-tree/` 家族在 v2 中
保留原样（侧面板不再使用它们，但上游可能仍在主工作区布局使用；后续若 knip 报未使用属预期）。

## 3. CLI 内核 prompt/工具描述 — 持有本地（低冲突成本）

| 路径 | 内容 | 同步策略 |
| --- | --- | --- |
| `core/src/context/sections/identity.ts` | Harness 块「必须同轮打包」强指令 | 上游改 Harness 结构（如 deliveryNotice）时保留机制、套用强指令措辞；`context-builder.test.ts` 的 Harness 断言同步更新 |
| `core/src/context/dynamic-sections.ts` | LATEX_MATH_PROMPT 独立条目（上游已删 Communicating 长段） | 上游若再调整 Dynamic Behavior 组成，LaTeX 条目跟随迁移 |
| `core/src/tool/handlers/{read,grep,agent,bash-prompt,tool-search}.ts` | 条件式读取、检索分层、委派阈值、常驻工具直调提示 | 与 `tests/tool-contracts.test.ts` 断言成对修改 |
| `packages/office-runtime/` | 查看器插件放开工作区外路径 | CONTRACT.md 与实现成对 |

## 4. 默认行为偏好 — 持有本地

- 新任务默认模式＝完全访问；全局新建任务不继承项目（落未归类草稿）。
- 查看器插件允许工作区外文件访问。
- macOS 关闭 vibrancy；打开方式菜单裁剪 Sublime/Terminal 系（保留 JetBrains）。

## 5. 测试基线 — 跟随上游

- v2 保留上游全部测试与门禁（pre-push、architecture:check）。
- 例外：上游在 2026-10-29 sync 中已自行删除的 App 业务单测（editors.test.ts、
  webLoginPage.test.ts、rewardsMenuIcon.test.ts 等）随上游删除；CLI core 测试全保留。
- 个人定制改变行为时同步更新对应断言（先例：context-builder、tool-contracts、
  desktopProductIdentity、settings-ui-polish、help-menu-about 等）。

## 6. 刻意不移植的历史改造（同步时勿「顺手恢复」）

- 全仓库 2→4 空格重排版、全量 lint 豁免重写（ae85161f/dc114e69/e291ed97/ff7ca386）。
- 删除全部测试与测试基础设施（1d224ba1）、删除包/Docker/文档（ae9cb542）。
- 移除架构治理与 pre-push 门禁（f55344f2）。
- 安装包瘦身与排除名单（ca3b0be7/839297f3/bcf37ec9）——如需瘦身，改为只动
  electron-builder 配置的 exclude 列表，不删源码文件。
- 个人 CI 发布链（59e3f094/d8ffa27c/7245ff04/1b7a69d0）——需要发布时再按当时上游
  workflow 结构重做。
- 手工吸收上游的两个巨型提交（00655193/e840f1f5）——v2 用真 merge 取代，勿再手工摘入。
