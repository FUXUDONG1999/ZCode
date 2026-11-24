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
| `packages/ui/src/i18n/locales/{zh-CN,en-US}.ts`、web 展示文案 | 用户可见文案中的品牌串 | 冲突块逐条取本地品牌串、保留上游新增键（先例见 9af88442 重放）；i18n 值中「已登录的 ZCode App」指官方手机 App，保留 |
| `packages/desktop/src/main/{desktopCommandHandlers,executableOpenGuard,autoUpdater}.ts`、`packages/web/src/main.tsx` | 主进程原生对话框（崩溃恢复、可执行文件打开确认、Linux 更新授权）与登录回调页标题里的品牌串 | 上游新增对话框文案时逐条替换为 MyAgent（先例：v4.0.0 同步） |
| `apps/zcode-cli/packages/bootstrap/.../product-projection.ts`、协议行 | 协议/产品投影中的名称 | 小 diff，持有本地 |

## 2. 桌面 UI 定制 — 持有本地（小 diff）

| 路径 | 内容 | 同步策略 |
| --- | --- | --- |
| `packages/ui/src/project-sidebar/ProjectSidebarNavigation.tsx` | 侧边栏只留新建任务+远控设备头，无自动化/插件入口 | 上游在此新增入口时：新功能默认保留，仅维持已有入口的移除 |
| `packages/ui/src/project-sidebar/ProjectNodeContent.tsx`、`ProjectTaskRows.tsx` | 移除「查看文件」入口（showFiles/onOpenFileTree 不下发） | 上游 `chronological` 等新机制跟随上游 |
| `packages/ui/src/FileManagerPane.tsx`（新增） | 侧面板文件预览仅内容、无目录树 | 上游重构 WorkspaceFileTree 时本文件不受影响；PreviewPane 的 prop 原样透传，上游给 PreviewPane 加 prop 不用改它 |
| `packages/ui/src/app-shell/AnimatedSidePanePanel.tsx`、`WorkspaceShellLayout.tsx`、`hooks/useAppPanels.ts` | 面板按需放回（子 agent/调用轨迹/文件预览/计划详情/后台命令输出）；不再传递 onNavigateFileManager；code-viewer tab 透传定位回执（`appliedFocusRequestId`/`onFocusRequestApplied`） | 上游新增面板类型时正常合入；新增会话联动面板类型需评估是否加入展开闸门白名单（`PERSONAL_EDITION_EXPANDABLE_SIDE_PANE_TAB_TYPES`，2026-11-23 补了 `bash-output`）；上游在它自己的面板调用处插的 prop 展开不适用于本分支，要在自建 FileManagerPane 调用处补 |
| 状态行 Git 胶囊与图谱筛选（#35）——`ui/src/v4/ConversationStatusPanel.tsx`（Git 胶囊贴左 + 占位 span + 同文件新组件 `GitStatusCapsule`；2026-11-24 起占位 span 独立于 Git 分支、至少一个胶囊时渲染，没有 Git 胶囊时其余胶囊也贴右）、`ui/src/GitBranchSwitcher.tsx`（导出 `useHostedGitGraphDialogOpen`）、`ui/src/git-graph/{GitGraphDialog,GitGraphPane}.tsx`（筛选栏与筛选状态）；additive：`shared/src/git.ts`、`services/src/git/gitService.ts`、`repo/gitCliRepo.ts`、`repo/gitCliTypes.ts`（`getCommitGraph` 末位可选参数 `filters`）、i18n 五语种 `gitGraph.filter.*`；规格 `docs/ui/chat-summary-panel.md`、`docs/git/git-graph.md` 的「个人定制」段 | Git 胶囊在会话目录是 Git 仓库时常驻；图谱按作者/「只看我的」/路径筛选（档案 B7） | 上游改状态行布局时保住「Git 胶囊贴左 + 其后的占位 span（至少一个胶囊时渲染，不能并进 Git 分支）」；上游若把图谱改成独立请求链路，`author`/`path` 两个参数跟着迁；筛选栏没有新文件，随 `GitGraphPane.tsx` 合并 |
| `WorkspaceHeaderSections/WorkspaceHeaderActionSection.tsx` | 侧面板开关只保留面板内的折叠按钮，头部那个开关已移除——折叠后没有可点的展开开关，点文件链接才会再展开 | 上游 e2e 里「折叠侧面板再展开」的步骤在本分支跑不了。文件链接行号用例（MFL01）2026-11-23 已按本分支适配：去掉「头部开关再展开 + 确认没被拉回」，改为折叠后点同一链接重新展开并定位；上游改这段时保留适配 |
| 文件链接文字行号兜底（#36）——`ui/src/components/ai-elements/message.tsx`（新增 `resolveLabelLineRanges`；`a` 渲染分支在地址解析不出行号时取文字里的行号）；规格 `docs/ui/preview-pane.md`「带行号的文件链接」 | 链接文字以「地址的文件名 + 行号」结尾、地址不带行号时，按文字行号定位（档案 E 的 #36） | 上游改 `a` 渲染分支时保住兜底；上游原生实现同语义则整体取上游 |
| `packages/ui/src/SettingsPage.tsx`、账户菜单、任务页 | 移除推荐/帮助/邀请入口，One Dark Pro 配色 | 上游「职业引导」为新增功能已跟随上游保留（决策点：如不想要可移除 onOpenOnboardingDialog 一处） |
| `desktopWindowChrome.ts`、`WindowsTopLeftLogo.tsx` | 窗口控制按钮右上角固定、品牌角标 | 持有本地 |
| `ui/src/App.tsx`（Side Pane Full View）+ `app-shell/types.ts` | 侧面板完整视图控制器与快捷键标签移除（prop 可选，保持不传）；上游必填的 `handleSidePaneDraftPromotion` 保留接线 | 上游演进完整视图时 prop 维持可选/不传；若上游把控制器改为必填需重新评估 |
| `ui/src/quickpick/quickPickCommands.ts` | `togglePreview`/`openTerminalTab`/`openBrowserTab`/`openReviewTab` 改为可选（个人版命令面板不上报这四项）；`reloadExtensions`/`openExtensionLogs` 跟随上游 | 上游新增命令字段按需保持可选 |
| `packages/desktop/src/main/logger.ts` | 主进程日志异步批量落盘（perf） | 上游改日志格式时注意 `ensureLogDirectory`/退出兜底链路 |
| `editors.ts`、`openInEditor.ts` | JetBrains 全家桶检测、Toolbox 识别、`--line` 定位、Sublime Text 条目（#30 回归） | 上游演进跟随上游，保留新增编辑器条目 |
| 打开方式定制（#30）——新增：`desktop/src/main/fileApplicationVisibility.ts`；additive：`file-open-apps/index.ts`（isExcluded）、`main/fileApplications.ts`（删 Numbers/QuickTime）、`desktopMainIpcPlatform.ts`、`ui/src/file-menu/useFileApplications.ts`（origin 分发 + 固定收藏排序） | 文件打开方式 = 系统关联（过移除清单+编辑器影子去重）+ 编辑器白名单固定入口（Sublime/Chrome 置顶）。定位项（Finder/资源管理器打开并选中）已被上游 v3.17.2 同语义实现取代（`getSystemFileLocatorEditorId` + `reveal` prop），**跟随上游**，本地旧实现（`getFileManagerEditorId`/`handleRevealInFileManager`）已移除 | 新文件无上游冲突；additive 处正常三方合并；上游重构 useFileApplications/FileApplicationChoices 时保住 origin 分发与 PINNED 排序约定（档案 E6）。message.tsx 残留的本地重复定位菜单项已于 2026-11-09 清除（对齐上游 revealCount=1 断言，勿恢复） |
| token 用量状态条——纯新增：`shared/src/token-usage.ts`、`desktop/src/main/tokenUsageSnapshotQuery.ts`+`tokenUsageStatusPump.ts`、`ui/src/store/tokenUsageStatusStore.ts`、`ui/src/v4/composer/tokenUsageStatusBar.tsx`；additive：`channels.ts`、`platform.ts`、preload、`useRootPlatformEffects`、`ConversationComposer`、i18n；插槽：`ChatPromptEditor.bottomContent` | 原生 token 状态条：主进程 SQLite 只读泵 + composer 卡片状态行（spec：docs/desktop/token-usage-statusbar.md） | 新文件无上游冲突；additive 处正常三方合并；上游重构 composer 布局时 bottomContent 插槽随迁；CLI usage 表 migration 变更需同步查询与回归测试 |
| 语音输入入口移除（#31，v3.18.0）——`ConversationComposer.tsx` 不渲染 `VoiceInputButton`；删除 `e2e/ui-shell/composer/composer-voice-input.test.ts` | composer 语音输入不暴露入口；`voice-input/` 模块、桌面 `microphone-access`、ASR helper 保留 | 上游演进语音输入时跟随实现、维持入口不渲染；hook 若改为挂载即请求权限需同步收紧接线。v4.0.0 起上游有语音快捷键（`useVoiceInputShortcut`，不依赖按钮）：composer 不调用该 hook，`ShortcutSettingsSection` 隐藏 `toggleVoiceInput` |

**注意**：上游 `packages/ui/src/WorkspaceFileTree.tsx` 与 `workspace-file-tree/` 家族在 v2 中
保留原样（侧面板不再使用它们，但上游可能仍在主工作区布局使用；后续若 knip 报未使用属预期）。

## 3. CLI 内核 prompt/工具描述 — 持有本地（低冲突成本）

| 路径 | 内容 | 同步策略 |
| --- | --- | --- |
| `core/src/context/sections/identity.ts` | Harness 块「必须同轮打包」强指令 | 上游改 Harness 结构（如 deliveryNotice）时保留机制、套用强指令措辞；`context-builder.test.ts` 的 Harness 断言同步更新 |
| `core/src/context/dynamic-sections.ts` | LATEX_MATH_PROMPT 独立条目（上游已删 Communicating 长段） | 上游若再调整 Dynamic Behavior 组成，LaTeX 条目跟随迁移 |
| `core/src/tool/handlers/{read,grep,agent,bash-prompt,tool-search}.ts` | 条件式读取、检索分层、委派阈值、常驻工具直调提示 | 与 `tests/tool-contracts.test.ts` 断言成对修改（v4.0.0 起上游精简了该文件，#7/#8 断言在 `keeps the personal wording…` 用例）；ToolSearch 未命中文案优先级 = deferred 命中 → 常驻直调提示 → MCP 诊断 → 通用长文案 |
| `packages/office-runtime/` | 查看器插件放开工作区外路径 | CONTRACT.md 与实现成对 |

## 4. 默认行为偏好 — 持有本地

- 新任务默认模式＝完全访问；全局新建任务不继承项目（落未归类草稿）。
- 查看器插件允许工作区外文件访问。
- macOS 关闭 vibrancy；打开方式菜单裁剪 Sublime/Terminal 系（保留 JetBrains）。
- `scripts/windows-visual-studio-generator.mjs`（本分支新增的叶子模块）与
  `scripts/build-windows-runtime-host.mjs`：Windows 生成器由硬编码 VS 2022 改为探测
  `cmake --help` 取最新 VS 生成器（回退 2022）。原因：GitHub 托管镜像 2026 年起移除
  VS2022 只带 VS2026（actions/runner-images #14017；2026-11 实测 `windows-latest` =
  `windows-2025-vs2026`），硬编码生成器直接 CMake 失败。叶子模块导出
  `pickVisualStudioGenerator`、`resolveVisualStudioGenerator(command, { timeoutMs })`
  （command 传后续 configure/build 用的同一个 CMake）与 `DEFAULT_VISUAL_STUDIO_GENERATOR`，
  runtime host 入口和下面的 shim 脚本都从它导入。探测逻辑 2026-11-23 才从入口脚本抽出：
  入口脚本带顶层 await 的 CLI 块，而 shim 脚本会被 `wdio.conf.ts` 经 jiti 求值，jiti 不认
  顶层 await，shim 直接导入入口脚本会让整套 e2e 在加载配置时失败。上游若同步修，取上游
  实现；本地此改动可安全丢弃。测试 `scripts/test/windows-runtime-host-build.test.mjs`
  （`node --test` 直跑）。
  v3.18.1 合入的 `scripts/test/installer-process-helper.test.mjs` 同样处理：测试内
  `resolveRuntimeHostBuild(arch)` 改传 `resolveVisualStudioGenerator()` 探测结果（从叶子
  模块导入），否则 VS2026-only 机器配置阶段即失败（上游测试按 VS2022 默认值写死）。
- `packages/desktop/scripts/build-windows-preinstalled-entry-shim.mjs`（上游 v4.0.0 新增）原先
  同样写死 `Visual Studio 17 2022`。`prepare:runtime-assets` 在 win32 无条件真编译它
  （`prepare:native-search` 在 CI 只解压预编译包，不受影响），所以合并 v4.0.0 后 Windows CI
  必挂。2026-11-23 已改为 `resolveVisualStudioGenerator(command, { timeoutMs })`：探测与
  configure/build 用 `resolveCmake` 解析出的同一个命令，计入 5 分钟准备预算。连带改动：
  上游工程测试 `packages/desktop/test/preinstalledEntryShimBuild.test.ts`（夹具多拷叶子
  模块、假 CMake 应答 `--help` 并记录 `-G`，新增「取最新 VS 生成器」与「可被 WDIO 加载器
  求值」两例）与规格 `docs/preinstalled-tools/windows-entry-shim.md`（构建、预算两处）。
  上游若自己修了这处，取上游实现并撤掉连带改动。真实 MSVC 编译本机验证不了，靠推送后
  的 CI。
- `scripts/prebuilt-binary-extract.mjs`（2026-11-23）：win32 zip 解压从 powershell.exe
  `Expand-Archive` 改为系统 bsdtar（`%SystemRoot%\System32\tar.exe`，Windows 10 1803+ /
  Server 2019+ 预装）。原因：run #52 实测 runner 镜像更新后 powershell.exe 5.1 经继承的
  PSModulePath 加载 pwsh7 目录的 Archive 模块，其 `ExtractToDirectory` 三参重载在
  .NET Framework 下解析不到，解压中断导致 `prepare:native-search` 找不到 ugrep.exe
  （run #51 同代码是绿的，纯镜像回归，本分支提交未变）。覆盖 ugrep/ripgrep 全部 win32
  zip 产物；tar.gz 分支与 Linux/macOS 的 unzip 路径不受影响。测试
  `scripts/test/prebuilt-binary-extract.test.mjs`（`node --test` 直跑）。上游若改此处，
  取上游实现。
- 同目录还有第三处写死：`scripts/native-search-tools-windows.mjs`（开源首个提交就有）。CI
  不走编译路径，不影响 CI；只在 Windows 本机从源码编译 native-search 时会踩到，未处理。

## 5. 测试基线 — 跟随上游

- v2 保留上游全部测试与门禁（pre-push、architecture:check）。
- 例外：上游在 2026-10-29 sync 中已自行删除的 App 业务单测（editors.test.ts、
  webLoginPage.test.ts、rewardsMenuIcon.test.ts 等）随上游删除；CLI core 测试全保留。
- 个人定制改变行为时同步更新对应断言（先例：context-builder、tool-contracts、
  desktopProductIdentity、settings-ui-polish、help-menu-about 等）。
- 上游 manual-review 用例依赖本分支已移除的 UI 时：改动面只有一两步、且在本分支有等价
  操作的，就地适配并留「个人定制」注释（先例：文件链接行号用例 MFL01，见 §2 头部开关
  一行与 E 的 #23）；没有等价操作的不改，按存量分歧处理，结论记进档案。
- 文件链接行号用例 2026-11-24 追加 MFL03（个人定制，#36 的回归用例）：行号只在链接文字里、
  地址不带行号时按文字定位。新 marker `E2E_MESSAGE_FILE_LINK_LABEL_LINE_JUMP`，case-local
  fixture 加了两条（正文、标题 sidecar），manifest 同步；上游那条主响应的 `body` 没动。
  断言一律用上游 `readPreviewRangeState` 那组（只看可见面板），单行也写成 `[42]`：它排在
  前两个用例之后，前两个会话仍隐藏挂在 DOM 里，上游单行断言取 DOM 里第一个预览面板，
  读到的是旧面板（2026-11-24 实测 `ready:false`）。上游改这个用例时保留适配。
- #35 就地适配（2026-11-23）：`conversation-session-git-review-entry`（SP13）不再断言 Git
  审查面板，改为断言 Git 胶囊——分支名与贴左、浮层顺序、分支切换、图谱两条入口、新增文件
  与修改文件的 Diff、图谱筛选（提交由 spec 自己造）。它的首个用例在应用启动后几秒内点击，
  会被营销弹窗盖住，所以开胶囊前先关弹窗、被拦再重试。上游改这个用例时保留适配。
  2026-11-24 实测弹窗来得更晚时，首个用例会挂在「提交新建分支」之后（`[role="dialog"]`
  反向等待超时），产品文件换回 HEAD 同样复现，第二个用例跟着被盖住而超时。要本地跑通，在
  `createSubmit.click()` 后加一次 `closeCloudContentDialogIfPresent()`（未验证）。
  i18n 五个 locale 文件的 `oxfmt --check` 差异（zh-CN 6 行、en-US 15 行）在改动前就有。
- `conversation-session-status-panel-inline-layout`：桌面用例由 spec 自己保证工作区是 Git
  仓库，并新增状态行左右贴边断言，已通过。手机 Web 用例要点侧栏底部的「移动端远程控制」
  按钮，本分支没有这个入口（上游挂在 `WorkspaceSidebarFooter.tsx`，本分支这个文件不再挂载
  它），属存量分歧，未适配。
- 同一用例 2026-11-24 追加非 Git 场景（接在桌面用例末尾）：项目目录建在系统临时目录——
  隔离 HOME 在本仓库里，其下的目录都会被 `git rev-parse` 识别成本仓库，造不出「非 Git」。
  断言没有 Git 胶囊时其余胶囊贴右、没有任何胶囊时状态栏不占高度；case-local fixture 新增
  `non-git-empty`、`non-git-goal` 两条响应，manifest 同步。项目名取目录名，因为侧栏 helper
  按目录名定位项目行。上游改这个用例时保留适配。
- `conversation-session-background-bash-output` 未改动，是 B3 里 `bash-output` 白名单增补的
  回归用例：本地回放 7/7 通过，去掉白名单那一行 7/7 失败。
- 本地跑 e2e 是真实的桌面窗口：窗口被点关闭（右上角 × 或标题栏菜单）时用例会以
  `invalid session id` 失败，重跑即可。窗口里被点了会话或链接同样会改变被测状态
  （2026-11-24 实测：MFL03 轮询期间当前会话被切回上一个用例、预览状态连续变化，测试自己
  没发任何点击），跑的期间别碰窗口。
- 存量环境问题（2026-11-23 实测）：官方后台会向新 profile 下发营销弹窗
  `cloud-content-dialog`（「全新登场…」，`marketing-touch`，上游 e2e 注释记为 2026-11 的
  版本介绍投放），出现时机不定，出现后盖住整个窗口。上游 helper
  `closeCloudContentDialogIfPresent`（`#e2e/helpers/occupation-onboarding`）原本只在职业
  引导循环里用，本分支把它导出，受影响的用例在被盖住的点击前调用（先例：文件链接行号
  用例的 `clickBodyFileLink`）。它「不出现不等待」，弹窗来得比调用晚仍可能盖住后续点击，
  遇到就在那一处再加一次。

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
