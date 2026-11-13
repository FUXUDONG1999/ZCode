# MyAgent v2 相对上游 main 的有意偏离清单

> 本文件是 `personal/myagent-v2` 的同步裁决手册：每次从 main 合并遇到冲突时，按本清单
> 判断该文件「跟随上游」还是「持有本地」。清单之外的原则：**能跟随上游就跟随上游**。
>
> 功能级的详细档案（每个功能的意图/改动点/适配决策/验证锚点/同步先例）见
> [MYAGENT-FEATURES.md](./MYAGENT-FEATURES.md)；本文是文件级的速查表。
>
> v2 重建原则：新增文件 > 小幅修改上游文件 > 永不删除上游文件（当前仅 5 个删除：品牌
> 资产 Z.svg、3 个已移除功能的 manual-review 测试、1 个入口已裁剪功能的 gating e2e）。
> 不做全仓库重排版，不删测试与文档。

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
| `packages/ui/src/app-shell/AnimatedSidePanePanel.tsx`、`WorkspaceShellLayout.tsx`、`hooks/useAppPanels.ts` | 面板按需放回（子 agent/调用轨迹/文件预览/计划详情）；不再传递 onNavigateFileManager | 上游新增面板类型时正常合入；新增会话联动面板类型需评估是否加入展开闸门白名单 |
| `packages/ui/src/SettingsPage.tsx`、账户菜单、任务页 | 移除推荐/帮助/邀请入口，One Dark Pro 配色 | 上游「职业引导」为新增功能已跟随上游保留（决策点：如不想要可移除 onOpenOnboardingDialog 一处） |
| `desktopWindowChrome.ts`、`WindowsTopLeftLogo.tsx` | 窗口控制按钮右上角固定、品牌角标 | 持有本地 |
| `ui/src/App.tsx`（Side Pane Full View）+ `app-shell/types.ts` | 侧面板完整视图控制器与快捷键标签移除（prop 可选，保持不传）；上游必填的 `handleSidePaneDraftPromotion` 保留接线 | 上游演进完整视图时 prop 维持可选/不传；若上游把控制器改为必填需重新评估 |
| `ui/src/quickpick/quickPickCommands.ts` | `togglePreview`/`openTerminalTab`/`openBrowserTab`/`openReviewTab` 改为可选（个人版命令面板不上报这四项）；`reloadExtensions`/`openExtensionLogs` 跟随上游 | 上游新增命令字段按需保持可选 |
| `packages/desktop/src/main/logger.ts` | 主进程日志异步批量落盘（perf） | 上游改日志格式时注意 `ensureLogDirectory`/退出兜底链路 |
| `editors.ts`、`openInEditor.ts` | JetBrains 全家桶检测、Toolbox 识别、`--line` 定位、Sublime Text 条目（#30 回归） | 上游演进跟随上游，保留新增编辑器条目 |
| 打开方式定制（#30）——新增：`desktop/src/main/fileApplicationVisibility.ts`；additive：`file-open-apps/index.ts`（isExcluded）、`main/fileApplications.ts`（删 Numbers/QuickTime）、`desktopMainIpcPlatform.ts`、`ui/src/file-menu/useFileApplications.ts`（origin 分发 + 固定收藏排序） | 文件打开方式 = 系统关联（过移除清单+编辑器影子去重）+ 编辑器白名单固定入口（Sublime/Chrome 置顶）。定位项（Finder/资源管理器打开并选中）已被上游 v3.17.2 同语义实现取代（`getSystemFileLocatorEditorId` + `reveal` prop），**跟随上游**，本地旧实现（`getFileManagerEditorId`/`handleRevealInFileManager`）已移除 | 新文件无上游冲突；additive 处正常三方合并；上游重构 useFileApplications/FileApplicationChoices 时保住 origin 分发与 PINNED 排序约定（档案 E6）。message.tsx 残留的本地重复定位菜单项已于 2026-11-09 清除（对齐上游 revealCount=1 断言，勿恢复） |
| token 用量状态条——纯新增：`shared/src/token-usage.ts`、`desktop/src/main/tokenUsageSnapshotQuery.ts`+`tokenUsageStatusPump.ts`、`ui/src/store/tokenUsageStatusStore.ts`、`ui/src/v4/composer/tokenUsageStatusBar.tsx`；additive：`channels.ts`、`platform.ts`、preload、`useRootPlatformEffects`、`ConversationComposer`、i18n；插槽：`ChatPromptEditor.bottomContent` | 原生 token 状态条：主进程 SQLite 只读泵 + composer 卡片状态行（spec：docs/desktop/token-usage-statusbar.md） | 新文件无上游冲突；additive 处正常三方合并；上游重构 composer 布局时 bottomContent 插槽随迁；CLI usage 表 migration 变更需同步查询与回归测试 |
| 语音输入入口移除（#31，v3.18.0）——`ConversationComposer.tsx` 不渲染 `VoiceInputButton`；删除 `e2e/ui-shell/composer/composer-voice-input.test.ts` | composer 语音输入不暴露入口；`voice-input/` 模块、桌面 `microphone-access`、ASR helper 保留 | 上游演进语音输入时跟随实现、维持入口不渲染；hook 若改为挂载即请求权限需同步收紧接线 |

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
- `scripts/build-windows-runtime-host.mjs`：Windows 生成器由硬编码 VS 2022 改为探测
  `cmake --help` 取最新 VS 生成器（回退 2022）。原因：GitHub 托管镜像 2026 年起移除
  VS2022 只带 VS2026（actions/runner-images #14017），硬编码生成器在 `windows-latest`
  直接 CMake 失败。上游若同步修，取上游实现；本地此改动可安全丢弃。测试
  `scripts/test/windows-runtime-host-build.test.mjs`（`node --test` 直跑）。
  v3.18.1 合入的 `scripts/test/installer-process-helper.test.mjs` 同样处理：测试内
  `resolveRuntimeHostBuild(arch)` 改传 `resolveVisualStudioGenerator()` 探测结果，
  否则 VS2026-only 机器配置阶段即失败（上游测试按 VS2022 默认值写死）。

## 5. 测试基线 — 跟随上游

- v2 保留上游全部测试与门禁（pre-push、architecture:check）。
- 例外：上游在 2026-10-29 sync 中已自行删除的 App 业务单测（editors.test.ts、
  webLoginPage.test.ts、rewardsMenuIcon.test.ts 等）随上游删除；CLI core 测试全保留。
- 个人定制改变行为时同步更新对应断言（先例：context-builder、tool-contracts、
  desktopProductIdentity、settings-ui-polish、help-menu-about 等）。

## 5.5 协作文档 — 持有本地（小 diff）

| 路径 | 内容 | 同步策略 |
| --- | --- | --- |
| `AGENTS.md` | 「核心原则」首条：个人定制 fork 说明，开发/同步前必读两份定制档案 | 上游更新 AGENTS.md 时正常三方合并，仅保护首条定制规则 |
| `MYAGENT-FEATURES.md`、`MYAGENT-DIVERGENCE.md` | 定制档案（本文件） | 纯个人文件，上游无此文件；每次定制变更或同步后更新 |


## 6. 刻意不移植的历史改造（同步时勿「顺手恢复」）

- 全仓库 2→4 空格重排版、全量 lint 豁免重写（ae85161f/dc114e69/e291ed97/ff7ca386）。
- 删除全部测试与测试基础设施（1d224ba1）、删除包/Docker/文档（ae9cb542）。
- 移除架构治理与 pre-push 门禁（f55344f2）。
- 安装包瘦身与排除名单（ca3b0be7/839297f3/bcf37ec9）——如需瘦身，改为只动
  electron-builder 配置的 exclude 列表，不删源码文件。
- 个人 CI 发布链（59e3f094/d8ffa27c/7245ff04/1b7a69d0）——需要发布时再按当时上游
  workflow 结构重做。
- 手工吸收上游的两个巨型提交（00655193/e840f1f5）——v2 用真 merge 取代，勿再手工摘入。
