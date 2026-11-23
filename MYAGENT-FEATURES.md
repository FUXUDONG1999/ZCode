# MyAgent v2 功能特性档案

> **用途**：`personal/myagent-v2` 全部个人定制的逐项档案——每个功能的意图、改动点、
> v2 重放时的适配决策、后续增量同步策略与验证锚点。每次 `git merge main` 解冲突时，
> 先查本文档对应条目，再按 [MYAGENT-DIVERGENCE.md](./MYAGENT-DIVERGENCE.md) 的速查表裁决。
>
> **基线**：v2 基于 main `a60ba6a7`（2026-10-30 上游同步）+ 下列提交；功能基线为旧分支
> `4c14c7bd`（2026-10-29，今天之前的最后状态）。旧分支 10-30 的两个吸收提交
> （`00655193`/`e840f1f5`，遗留 22 个类型错误）已废弃、不含于 v2。
> 2026-11-04 已合并 main `a9fe401e`（v3.17.2，merge `7331f5ab`）：定位项撞车按「以远端为主」
> 取上游实现（见 E6），其余定制全部幸存。
> 2026-11-09 本地与该远端合并收口（本地工作区过期未拉取导致重复合并）：解法一致，
> 额外清除了 message.tsx 残留的本地重复定位菜单项（见 E6 撞车条目）。
> 2026-11-12 已合并 main `b95ebaff`（v3.18.0，merge `812aeee5`）：30 文件冲突按裁决表解，
> 上游新功能（扩展宿主/设计模式/工作树/登录区域/账户菜单 Rewards 入口）默认保留；
> 新增裁剪 #31（语音输入仅移除入口，实现保留）。附带修复上次合并遗留的
> useProjectFileTree 下划线参数与函数体错配（HEAD 上 typecheck 实际已破，门禁链无
> typecheck 环节未拦截）。
> 2026-11-13 已合并 upstream/main `fec97590`（v3.18.1+v3.18.2）：4 文件冲突——.gitignore
> 双取、composer-voice-input e2e 维持删除（#31）、App.tsx/ConversationComposer 持本地
> （完整视图控制器不接线、语音按钮不渲染）。上游语音权限引导浮层已合入：hook 挂载
> 仍惰性（useMicrophonePermissionGuide 仅建状态，浮层只在 toggle 失败后出现），无需
> 收紧接线；新增 voiceInput.permission.* 品牌串已按 §1 换 MyAgent（zh-CN/en-US）。
> build-windows-runtime-host.mjs 生成器探测与上游 installer-helper 双产物改动自动合
> 并成功（§4 预期场景）；上游新测试 installer-process-helper.test.mjs 的
> resolveRuntimeHostBuild 默认 VS2022 生成器在 VS2026-only 机器失败，已改为传探测
> 结果（§4 追记）。
> 2026-11-23 已合并 main `a4b44451`（v4.0.0，在 `6330e8e5` 之上，merge `a43c3f61`）：18 文件冲突
> （17 内容 + 1 改/删）按裁决表解。撞车一处——#23 行号定位被上游 `lineRanges` 机制
> 取代（见 E）；#31 顺带不接入上游新增的语音快捷键（见 E7）。上游新默认行为里与本
> 分支裁剪有交互的几项见 §I。

## 功能总表

| # | 功能 | v2 提交 | 类别 | 验证锚点 |
|---|---|---|---|---|
| 1 | MyAgent 品牌重命名 + A 字标图标 | `b3384330` | 品牌 | desktopProductIdentity.test.ts（10 用例）|
| 2 | 图标 macOS 网格适配 | `d3566225` | 品牌 | 视觉 |
| 3 | 品牌残留全量替换（含后续增量） | `361680be`+`34c723b1` | 品牌 | grep 检查（见 §1.4）|
| 4 | 简化 UI 入口（侧边栏/设置/账户菜单）| `ac644e5a` | UI 裁剪 | settingsNavigation.test.ts |
| 5 | VS Code 风格布局（文件树左、预览右）| `2c5fe640` | UI | 视觉：文件管理器分栏 |
| 6 | 全局新建任务不继承项目 | `5003dd40` | 行为 | 手动：全局新建落未归类 |
| 7 | 工具同轮打包强指引 | `585d0761` | CLI 内核 | context-builder（Harness 断言）|
| 8 | 读取/检索/委派分层指引 | `fdd028df` | CLI 内核 | tool-contracts（Read/Grep/Agent 模板）|
| 9 | 多代理同轮并发指引 | `25a6443c` | CLI 内核 | tool-contracts（Agent 模板）|
| 10 | 窗口控制按钮固定右上角 | `97ee7e0f` | UI | 视觉：WorkspaceHeader 右上 |
| 11 | 任务页 One Dark Pro 配色 + 移除推荐/帮助 | `0da194ca` | UI | styles.css:683 起 |
| 12 | 账户菜单移除界面偏好/邀请好友 | `60292fda` | UI 裁剪 | settings-ui-polish / marketing-touch-rewards e2e |
| 13 | 查看器插件放开工作区外文件访问 | `8346cca4` | 行为 | office-runtime smoke |
| 14 | 新任务默认完全访问模式 | `0ed85516` | 行为 | composer 默认值（视觉：模式徽标）|
| 15 | ToolSearch 未命中回填常驻工具直调提示 | `639a16b7` | CLI 内核 | tool-search-execution.test.ts |
| 16 | LaTeX 数学公式输出规范 | `c12d336b` | CLI 内核 | context-builder（LaTeX 用例）|
| 17 | Windows JetBrains 全家桶 + VS 检测 | `c54360cf` | 桌面能力 | editors.ts（RustRover×5）|
| 18 | macOS Toolbox 安装的 JetBrains 识别 | `1ce843ed` | 桌面能力 | editors.ts（Toolbox×15）|
| 19 | macOS 打开方式菜单精简（去 Sublime/Terminal 系）| `4bb5a32a` | UI 裁剪 | editors.ts（Sublime=0 处）|
| 20 | 移除左侧标签式侧面板与「查看文件」 | `5bfe0ec5` | UI 重构 | — |
| 21 | 侧面板按需放回（子agent/调用轨迹/文件预览）| `fd34077b` | UI 重构 | — |
| 22 | 任务文件预览仅内容（v2 适配版）| `69564f69` | UI 重构 | FileManagerPane.tsx |
| 23 | HTML 侧边预览 + 外部编辑器行列定位（行号跳转已随上游 v4.0.0）| `2a7a809d` | 桌面能力 | e2e conversation-session-message-file-link-line-jump（pending，上游用例）|
| 24 | 主进程日志异步批量落盘 | `bfa51bd0`+`5b0b78ad` | 性能 | logger.ts（PENDING_LOG_LINE_LIMIT）|
| 25 | 恢复设置页「归档管理」入口 | `a1fcb99a` | UI | settingsNavigation（archives 可见）|
| 26 | Token 用量状态条（原生实现）| `5acd31c8`+`23b606fc`+同批 | 桌面能力 | tokenUsageSnapshotQuery.test.ts（7 用例）|
| 27 | 隐藏「数据同步」设置分区 | `34c723b1` | UI 裁剪 | settingsNavigation（dataSync 隐藏）|
| 28 | 个人构建工作流（CI）| `34c723b1`+`412b75c4` | 工程 | GitHub Actions build-desktop |
| 29 | 架构基线登记定制新文件 | `31f92ef7`+同批 | 工程 | .architecture-baseline.json（10 条）|
| 30 | 打开方式定制（Sublime 回归/移除清单/Finder 定位）| `64662c94`+登记锚点 | 桌面能力 | 手动：文件右键菜单（见 E6）|
| 31 | 语音输入仅移除入口 + 不接入快捷键（v3.18.0/v4.0.0 新功能裁剪）| v3.18.0 合并批 | UI 裁剪 | grep 无 VoiceInputButton 渲染、无 useVoiceInputShortcut 调用 |
| 32 | 侧栏项目展开文件夹层（分支显示/切换）| `b1417b0a`+`cada0f4e`+`05ace97f` | UI | conversation-session-project-folder-branches e2e（pending）|
| 33 | 流式公式组件层缓存 + CJK 浮现两字一组 + 加载 orbs 30fps | `1e350ec8` | 性能 | typecheck/lint；spec：docs/chat/assistant-streaming-text-rendering.md |
| 34 | 滚动条着色改伪元素直接匹配 | `5b5e0558` | 性能 | typecheck/lint；spec：docs/chat/message-render-performance.md |

---

## A. 品牌（#1-3）

### A1. MyAgent 品牌重命名（`b3384330`，原 `9af88442`）

- **意图**：产品名 xudong→MyAgent / MyAgent Preview；图标换靛蓝-紫渐变圆角底+白色粗体 A。
  appId（dev.zcode.app）与更新通道不变。
- **改动点**（48 文件）：
  - 构建身份：`packages/desktop/scripts/desktop-product-identity.mjs`、`package.json`（productName）
  - 桌面 main：`about.ts`（关于页）、`desktopRuntimeEnv.ts`、`forceUpdate*.ts`、
    `desktopLinuxDeepLinkRegistration.ts`、`windowsCuaOperationIndicatorContent.ts`（新文件）、
    renderer 各 html 标题
  - UI：`WelcomeScreen`、`WindowsTopLeftLogo`、`WorkspaceSidebarFooter`、反馈/分享/高加速卡片文案
  - Web：登录页 locale、分享落地页、远控设备列表
  - i18n：zh-CN/en-US 全部品牌串（含 `安装 MyAgent Server`、`MyAgent Desktop` 等）
  - 测试跟随：`desktopProductIdentity.test.ts`、e2e `help-menu-about`、`container-boot`
- **同步策略**：上游新增含 "ZCode" 的用户可见文案时**增量替换**（见 §1.4 流程）；
  i18n 冲突块逐条取本地品牌串、**保留上游新增键**（先例：MCP trust 键、onboarding 键）。

### A2. 图标资产（`d3566225` + `361680be`）

- 图标二进制：`packages/desktop/build/icon*`、`build/icons/*`、`public/logo/icons/*`、
  `packages/ui/src/assets/A.svg`（新，替代 Z.svg，Z.svg 已删）、`favicon.ico`
- v2 已含 macOS 网格边距修正版（`d3566225`）与安装器图标（`icon_installer.*`）。
- **同步策略**：二进制冲突一律 `git checkout --ours`（本地版本），不要手工合并。

### A3. 品牌残留清单与增量流程（§1.4）

- 当前残留：i18n key 名含 ZCode（`toggleZCodeStdioTap`、`openInZCode`）——key 是代码
  标识，**不改**；值中只保留「已登录的 ZCode App」一处（指官方手机 App，不应替换）。
  其余值中残留 = 0（2026-11-23 实测清零：v3.18.0 合并遗留 7 行 + v4.0.0 新增 16 行；
  此前「= 0」的记录在 v3.18.0 合并后已失实，麦克风权限等 7 行一直没替换）。
- **每次同步 main 后执行**：
  ```bash
  grep -n "ZCode" packages/ui/src/i18n/locales/zh-CN.ts packages/ui/src/i18n/locales/en-US.ts
  # 值中出现的逐条替换为 MyAgent（key 名不动）；再全仓抽查新增 UI 文案
  git grep -n "ZCode" packages/web/src packages/desktop/src/main -- '*.ts' '*.tsx' | grep -v test
  ```
- 已知改过的非 i18n 品牌点：`desktopLinuxDeepLinkRegistration`（桌面文件名）、
  `webAuthLocale`、`ConversationShareLandingPage`、`officeSuggestedPrompts`；v4.0.0 新增
  `desktopCommandHandlers.ts`（崩溃恢复对话框，5 语种）、`executableOpenGuard.ts`（可执行
  文件打开确认标题）、`autoUpdater.ts`（Linux 更新授权提示）、`web/src/main.tsx`（回调页
  标题）、e2e `conversation-session-preinstalled-tools-worker-start-failure`（重启提示断言）。

---

## B. 桌面 UI 定制

### B1. 简化 UI 入口（`ac644e5a`，原 `79adea83`）

- **意图**：侧边栏只留「新建任务 + 远控设备头」；关闭 macOS vibrancy。
- **改动点**：
  - `ProjectSidebarNavigation.tsx`（**核心**）：仅 28 行，props 只 Pick
    `isWebRemoteControl | webRemoteControlWorkspaceSwitcher`。自动化/插件市场按钮整体移除
    （路由与页面实现保留，仅无入口）。
  - `desktopWindowChrome.ts`：vibrancy 关闭。
  - `SettingsPage.tsx`：设置侧栏「引导」入口移除（onboarding 对话框与状态保留）。
- **v2 适配决策**：上游新增「职业引导」（occupation onboarding）为**新功能**，跟随上游
  保留（hooks 与 `onOpenOnboardingDialog` 均在）。**如不想要**：删
  `settingsPageHelpers.tsx` 的引导卡片 + `SettingsPage.tsx` 的 `onOpenOnboardingDialog`
  传递 + 两个 hooks（`openOccupationOnboarding`/`requestMigrationDialog`——后者数据同步
  页仍在用，注意保留）。
- **同步策略**：上游在侧栏新增入口（新功能）默认保留；仅维持既有入口的移除状态。

### B2. VS Code 风格布局（`2c5fe640`，原 `d9a1b58e`）

- **意图**：文件管理器面板「目录树在左、内容预览在右」（上游原为预览左/树右）。
- **改动点**：`WorkspaceFileTree.tsx`（FILE_MANAGER_PANEL_IDS 顺序 `["directory","preview"]`
  + DOM 顺序）、`AnimatedSidePanePanel.tsx`、`WorkspaceShellLayout.tsx`。
- **v2 适配先例**：上游精修了分隔线样式（`after:inset-y-0 after:rounded-none`）——**取上游
  新样式**，定制只保布局顺序。
- **注意**：#22 落地后侧面板不再使用该组件；它仍服务于主工作区文件管理器。

### B3. 侧面板重构三连（#20-22）

- **#20 移除标签式侧面板**（`5bfe0ec5`，原 `f5a8d8b3`）：
  - 删除左侧标签式侧面板与任务行「查看文件」入口（`onOpenFileTree`/`onOpenTaskFiles`
    不再下发；`TaskGroupedView`/`ProjectTaskRows` 引用清理）。
  - 删除 3 个只测该面板的 manual-review 测试（`side-pane-plugin-menu.*`、`side-pane-toggle`）
    ——这是 v2 相对 main 仅有的文件删除之一。
- **#21 侧面板按需放回**（`fd34077b`，原 `e98a13b3`）：子 agent、调用轨迹、任务文件预览
  三类面板按需展开（`AnimatedSidePanePanel` + `WorkspaceShellLayout` 的展开闸门）。
  2026-11-02 修复：闸门白名单（`PERSONAL_EDITION_EXPANDABLE_SIDE_PANE_TAB_TYPES`）补入
  `plan-detail`——计划卡片「查看完整计划」此前提交 tab 后被闸门挡住，面板无法展开。
  其余会话联动类型（bash-output、workflow-*、plugin-ui、划选副屏）仍被闸门隐藏，
  如需放开按需增补白名单即可。
- **#22 预览仅内容**（`69564f69`，原 `0381cb28` **v2 适配版**）：
  - 新增 `packages/ui/src/FileManagerPane.tsx`：只渲染 PreviewPane + 空态。
  - 面板接线：`AnimatedSidePanePanel` 的 code-viewer/file-manager Tab 渲染新组件，
    移除 `onNavigateFileManager` 链（panel/types/App/useAppPanels 四处）。
  - **与原提交的差异（重要）**：上游 workspace-file-tree 家族 19 文件、`WorkspaceFileTree.tsx`、
    store 的 fileManagerNavigation 偏好、3 个 e2e 用例**全部保留**（上游活跃开发，不删）。
- **同步策略**：上游若重构侧面板体系，#21/#22 的接点集中在
  `AnimatedSidePanePanel.tsx` 一个文件；`FileManagerPane.tsx` 是自建文件无冲突。
- **v4.0.0 同步先例（2026-11-23）**：上游给 `PreviewPane` 加了「一次点击只定位一次」回执
  （`appliedFocusRequestId` / `onFocusRequestApplied`，记在 code-viewer tab 上）。
  `FileManagerPane` 把 previewProps 原样透传，所以只在 `AnimatedSidePanePanel.tsx` 的自建
  面板调用处按 `tab.type === "code-viewer"` 展开这两个 prop；上游在它自己的面板调用处
  （`onNavigate=` 之后）插的展开不适用于本分支，未取。同版上游删除
  `side-pane-full-view/enterRequest.ts` 与 `ConversationBackgroundWorkTrigger.tsx`，
  `App.tsx` 的 `summaryPanelVariantOverride*` 随上游删除，本分支无残留引用。

### B4. 菜单与配色（#4/#11/#12/#19/#25/#27）

- **账户菜单**（`60292fda`）：移除「界面语言/主题/模式/缩放」子菜单与「邀请好友」；
  Rewards 能力保留。改动 `WorkspaceSidebarFooter.tsx`（两处「个人定制」注释为锚点）。
- **任务页**（`0da194ca`）：`styles.css`（One Dark Pro 调色板，深色主题整体加深一档，
  注释锚点 styles.css:683）；移除推荐/帮助入口（`WorkspaceHeader`/`SessionPane`）。
- **设置分区显隐**（`settingsNavigation.ts` 的 `HIDDEN_SETTINGS_SECTIONS`，**单一控制点**）：
  - 隐藏（2026-11-12 体验后收敛）：`browser`、`remoteDevices`、`computerUse`、`dataSync`、
    `automations`、**`shares`**（分享管理，用户不需要；分享服务与已生成链接不受影响）、
    `plugins`（遗留 id，自动重定向到 `plugin`）
  - `plugin` 分区 2026-11-23 恢复可见：上游 v4.0.0 起项目目录插件（`plugins.dirs`）要在
    「设置 › 插件 › 项目」逐个信任才对新会话生效，分区藏着就没有信任入口。分区自带市场
    入口（User 作用域「浏览市场」）；侧栏的插件市场按钮（B1）仍不恢复
  - 可见：**`workspaceFileSearch`**、**`archives`**（#25 归档管理，2026-10-29 恢复）
  - 恢复/隐藏任一分区 = 从该 Set 增删一行，页面与数据层不动。
- **macOS 打开方式菜单**（#19，**部分被 #30 逆转**）：`editors.ts` 中 Terminal/iTerm/Ghostty
  条目保持删除；Sublime Text 已按 #30 加回并升级为文件打开方式的固定入口。

### B5. 侧栏项目文件夹层（#32）

- **意图**：本地项目行 hover 时「...」菜单左侧出现文件夹层 chevron，点开后每个 root
  一行——目录名 + 该文件夹 git 分支，可就地切分支/新建分支。多文件夹项目（各 root
  独立仓库）不用再进工作区头部逐个切；文件夹默认不显示，只有主动点开才出现。
  2026-11-12 二次增量：原独立「文件夹 (N)」小节头已删除，行内 chevron 为唯一入口，
  展开态由项目行持有。任务仍整组归属项目，文件夹是操作层不是导航层（虚拟项目 spec
  A2 边界不变；spec：`docs/superpowers/specs/2026-11-12-project-folder-branch-layer-design.md`）。
- **改动点**：
  - `packages/ui/src/project-sidebar/ProjectFolderRows.tsx`（**新增，核心**）：
    `ProjectFolderRows`（导出 `hasProjectFolderLayer` gate 供入口与行渲染共用 +
    primary 在前排序 + 受控 `open` prop，无内部状态 + `ServiceProvider` 钉住
    `useBaseWorkspaceServices()`）→ `ProjectFolderRow`（目录名/主目录 tooltip/i18n
    `project.folder.primaryRoot`）→ `ProjectFolderBranch`（`useFolderGitSummary` 按
    rootPath 实时拉 `getRepositorySummary`，不落库；复用 `GitBranchSwitcher`
    `popoverSide="right"`；`useGitAutoRefresh` 展开期间 watcher 自动刷新）。
    ServiceProvider 钉 base 的原因：GitBranchSwitcher 内部 `useServices()` 跟随激活
    tab，远端 tab 激活时本地 root 的 git 调用会被路由到远端 host。
  - `ProjectNodeContent.tsx`：持有 `folderLayerOpen`（useEffect 在项目收起时复位，
    收起态点 chevron 先 `onExpandedChange(true)` 再打开文件夹层）；行尾 hover 动作区
    首位渲染 chevron（`data-testid="project-folder-toggle"` 沿用，`aria-expanded` 表
    态，随动作区 hover 显示）；CollapsibleContent 内、ManagedWorktreeCreatingRows 前
    以 `open={isOpen && folderLayerOpen}` 挂载 `ProjectFolderRows`。
  - i18n：zh-CN/en-US 新增 `project.folder.primaryRoot`、`project.folder.sectionLabel`。
- **范围裁决**：仅本地项目（`hostId === "local"`）且多 root（单 root 与项目行重复，
  不渲染）；远程项目不做。非 git 文件夹只显目录名。分支数据实时派生，无 schema/CLI
  改动，不变量 I1-I17 不触碰。不改项目行展开默认值（上游 VP20 等正式 e2e 锁定
  「多 root 默认展开」；曾评估改 `useProjectSidebarPreferences.isExpanded` 兜底，
  因需连改 6 个上游用例且伤任务列表可见性而放弃，改为文件夹层自带收起态）。
- **验证锚点**：
  `packages/desktop/test/e2e/conversation-session/projects/manual-review/pending/conversation-session-project-folder-branches.test.ts`
  （本地回放：`ZCODE_E2E_MANUAL_REVIEW=1 E2E_PROVIDER_HTTP_MODE=replay
  E2E_PROVIDER_REPLAY_FIXTURE_PATH=packages/desktop/test/e2e/fixtures/upstream/common.json
  pnpm --filter @zcode/desktop test:e2e -- --spec <该文件>`）。测试要点：夹具须放系统
  临时目录（e2e home 在 ZCode 仓库内，非 git 目录会解析到外层仓库分支）；多 root 项目
  展开默认 true，展开前按 `aria-expanded` 判定是否需要点击；展开项目后文件夹层默认
  收起（断言 `project-folder-row` 不存在），移入项目行后点行内 `project-folder-toggle`
  （hover chevron）后才出现。
  2026-11-12 基线对照：virtual-project.test.ts 本机 6 个失败（VP20×3/VP10/VP12/
  VP08-17-18）为 fork 既有裁剪与上游测试的存量分歧，与本功能无关（摘除本功能复跑
  失败集相同）。
  2026-11-23 v4.0.0 合并后：原用例开局被营销弹窗盖住而失败（见 DIVERGENCE §5）；在
  临时副本里加「有弹窗先关」后通过，功能不受合并影响，正式用例待决策后再改。
  **手测待执行**（2026-11-12 桌面 E2E 已过，以下无运行时证据；使用者仅桌面端，
  手机 /remote 不在验证范围）：远端 tab 激活时展开本地项目切分支走本机；同仓库
  双 root 切换联动；运行中会话 cwd 上切分支。行内 chevron 入口 2026-11-12 dev
  版手测通过（hover 出现/点击铺开/再点收起/项目收起后复位）。
- **同步策略**：上游若改 `ProjectNodeContent` 展开区结构，只需保住挂载点一行与
  `ProjectFolderRows.tsx` 文件；上游若改 `GitBranchSwitcher` props，注意
  `workspacePath/dirtyFileCount/onRefreshGit` 三个入参仍可用。纯新增文件，无上游对应
  实现，冲突面极小。

### B6. 窗口按钮（#10，`97ee7e0f`）

- 面板常驻左侧后，标签栏仅在完整视图（`fullView`）承担标题栏职责时才渲染
  `DesktopWindowControls`；平时由右侧会话列的 WorkspaceHeader 承担（右上角）。
- 锚点：`AnimatedSidePanePanel.tsx` 的 `showWindowControls && fullView` 条件。

---

## C. 行为偏好（#6/#13/#14）

- **全局新建任务不继承项目**（`5003dd40`）：全局入口新建的任务显式落「未归类」草稿，
  不继承当前激活项目。改动 `project-sidebar/index.tsx`、`useRootWorkspaceActions.ts`。
- **新任务默认完全访问**（`0ed85516`）：`draftWorkspaceDefaults.ts`/`newTaskDraft.ts`/
  `useDraftConfigControl.ts`/`V4ComposerModeControls.tsx` 的默认 permission mode。
- **查看器工作区外访问**（`8346cca4`）：office-runtime 的
  `open_document/read_document/search_document` 接受工作区外绝对路径（类型/大小校验保留；
  `list_documents` 仍只列工作区）。改动 `adapters/files.ts`、`adapters/server.ts`、
  `CONTRACT.md`、smoke 脚本。上游若改会话模型（per-session state），**Paths 条目语义不变**
  （先例：Sessions 条目重写时保留了定制的 Paths 条目）。

---

## D. CLI 内核（#7-9/#15/#16）

> 共性：源码与 `tool-contracts.test.ts`/`context-builder.test.ts` 断言**成对修改**；
> 设计文档 `docs/design/v2/{loop,tool}/*.md` 同步记录。上游改 prompt 结构时，
> **保留上游机制、套用定制措辞**。
> v4.0.0 起上游删掉了 `tool-contracts.test.ts` 里两个大而脆的用例（#7/#8 断言原在其中），
> 本分支断言改挂精简用例 `keeps the personal wording for Bash batching and conditional
> Read`（只断言 bullet 子串存在）。

- **#7 同轮打包**（`585d0761`）：`identity.ts` Harness 块第 4 条 bullet 升级为
  「If you intend to call multiple tools… make all of the independent calls in the same
  response — batch independent commands and file reads in one turn…」；`bash-prompt.ts`
  同步。先例：上游引入 `deliveryNotice` 变量时保留了该机制、只改并行条目措辞。
  Harness bullets 数量=5 有断言（context-builder）。v4.0.0 起 `bash-prompt.ts` 的同轮打包
  bullet 排在上游新增的 `run_in_background` 说明（前台 `sleep` 拦截）之后。
- **#8 分层指引**（`fdd028df`）：Read 条件式（任务围绕该文件→全读；否则 offset/limit）；
  Grep「先 files_with_matches 定位、再 content 精读」；Agent 委派阈值（>3 次查询的宽泛
  调研→subagent_type=Explore）。先例：上游改 Read 描述行时取定制版（语义超集）。
- **#9 多代理并发**（`25a6443c`）：Agent 描述 When-to-use 段加同轮多 agent 并发指引。
- **#15 ToolSearch 直调提示**（`639a16b7`）：deferred 未命中但常驻工具命中时，回填
  「These tools are already loaded (resident) — call them directly…」。实现横跨
  contracts（schema `resident_matches`）/handler（searchResidentTools）/format 三层；
  纯未命中跟随上游长文案（断言已对齐）。v4.0.0 起上游加了 MCP 连接等待与未命中诊断
  （`readLatest`/`waitForPending`/`pending_mcp_servers`/`failed_mcp_servers`）：等待只发生在
  上游的 `matches.length === 0 || missing.length > 0` 分支内，常驻回填在其后；未命中文案
  优先级 = deferred 命中 → 常驻直调提示 → MCP 诊断 → 通用长文案。
- **#16 LaTeX**（`c12d336b`，**结构适配**）：上游删除了「# Communicating with the user」
  长段后，定制规则改为**独立常量 `LATEX_MATH_PROMPT`** 并入精简后的 Dynamic Behavior
  （`[COMMUNICATION, LATEX, PRONOUNS, ACTION].join`）。断言锚点：
  `EXPECTED_LATEX_MATH_PROMPT`、排序（LaTeX 在代词段之前）、专用测试用例。
  上游若再调 Dynamic Behavior 组成，规则条目跟随迁移即可。

---

## E. 桌面能力（#17/#18/#23/#24）

- **#17/#18 JetBrains 检测**（`c54360cf`+`1ce843ed`）：Windows 全家桶 + Visual Studio、
  macOS Toolbox 2.x（`~/Applications` 前缀匹配）与 RustRover。全部在
  `packages/desktop/src/main/editors.ts`（上游无此内容，纯定制；曾于旧分支 10-30
  吸收时被覆盖丢失，v2 已恢复）。上游演进 editors.ts 时正常三方合并。
- **#23 HTML 侧边预览 + 外部编辑器行列定位**（`2a7a809d`，**行号跳转已被上游取代**）：
  - **v4.0.0 撞车裁决（2026-11-23）**：上游原生实现消息文件链接定位——`lineRanges` 多段
    区间（`a.ts:30-35`、`#L30-L35`、`:30,40-42`）、列号只解析不定位、code-viewer tab 记
    `appliedFocusRequestId` 保证一次点击只定位一次——是本定制 `lineNumber`/`revealLine`
    的超集。按「以远端为主」整体取上游：`markdownFileLink.ts`、`codeViewer.ts` 取上游
    版本，本地的 `revealLine` 路径（codeViewer/previewPaneContent/message/
    WorkspaceShellLayout/OpenSplitButton）全部移除。
  - 仍属本定制：`previewPaneHtmlContent.tsx`（新文件：HTML 侧边渲染，接在
    `previewPaneContent.tsx`）、`platform.ts` 的 `OpenInEditorOptions.line/column`、
    `openInEditor.ts`（VS Code `--goto path:line:column` / JetBrains `--line`）、
    `message.tsx` 的 `columnNumber` 解析与外部编辑器传参（定位行取
    `lineRanges[0].startLine`）、`OpenSplitButton.tsx` 同口径。
  - **后续同步**：链接解析与预览定位跟随上游，不再维护本地实现；本定制只剩「外部编辑器
    带行列打开」和「HTML 侧边预览」两个接点，上游改 `MessageFileLinkTarget` 时保住
    `columnNumber`。
  - **已废弃部分**：原 PreviewPane 内的 `handleOpenInEditor`（上游已把「用编辑器打开」
    移出该组件），hunk 不再适用——行号传参已由上游新调用点承担。
  - **与上游 v3.17.2 的关系（2026-11-04 对比结论）**：上游新增「内置浏览器本地 HTML 预览」
    （`browser-local-preview/`，`file://` → `zcode-html://` 签名协议，仅作用于内嵌浏览器
    session）；#23 的侧边 HTML 预览是沙箱 iframe `srcDoc` 渲染（fileService 读文本，远程
    workspace 也可用），两条链路互补无冲突，全部保留。用户决策：HTML 预览**以远端机制为主**——
    未来若上游侧边预览与本特性冲突，按「跟随上游」裁决。
  - **验证锚点（2026-11-23 本地回放实测）**：上游用例
    `packages/desktop/test/e2e/conversation-session/presentation/manual-review/pending/conversation-session-message-file-link-line-jump.test.ts`。
    MFL02（区间与多段）在本分支直接通过；MFL01 卡在「折叠后点头部开关再展开」——本分支
    没有头部开关（见 DIVERGENCE §2）。去掉该步的临时适配副本（折叠后再点同一链接展开）
    两用例全过：单行定位高亮、再点重新定位、同文件复用 tab、`:行:列`、无行号与超出行数
    停在开头，都走自建预览面板的定位回执链路。「重新挂载不回跳」在本分支没有对应的用户
    操作路径，只有静态接线证据。回放命令同 B5，`E2E_PROVIDER_REPLAY_FIXTURE_PATH` 用
    `common.json` 加 `conversation-session/conversation-session-message-file-link-line-jump.json`。
- **#24 异步日志**（`bfa51bd0`+`5b0b78ad`）：行进内存队列、setImmediate 合并、
  每-文件链式 Promise、退出同步兜底、缓冲上限 2000；`exportLogs.ts` 配套。
  上游若改日志格式/TTFT 分流，注意保留 `ensureLogDirectory` 与退出兜底链路。

### E5. Token 用量状态条（#26，原生实现）

- **意图**：composer 卡片内状态条（速度/上下文/本轮/会话/工具/今日/子代理 + 悬停明细 +
  ⚙ 开关）。历史：原 #26 简易速度已 revert（`5acd31c8`）；曾按 vendored 方案固化上游插件
  zcode-token-usage-statusbar（`9d935d66`），其 executeJavaScript 注入 overlay.js 的 DOM
  探测在 fork 产物上失效（状态条无法显示），已 revert（`23b606fc`），改按其统计口径原生重写。
  spec：docs/desktop/token-usage-statusbar.md。
- **改动点**：
  - `packages/shared/src/token-usage.ts`：快照契约（zod）+ `PlatformChannels.TokenUsageSnapshot`
    + `IPlatformService.onTokenUsageSnapshot?`（可选成员，web 不实现）；
  - `packages/desktop/src/main/tokenUsageSnapshotQuery.ts`：只读查询（node:sqlite，口径移植
    zusage.py，见注释）；`tokenUsageStatusPump.ts`：fs.watch 泵（300ms 去抖 + 30s 心跳）+
    复用 `zcode:sync-active-task-session` 维护窗口→焦点会话映射 + 逐窗口推送；
    `index.ts` whenReady 一行启动；`services/node.ts` 重导出 `resolveAgentSessionDbPath`；
  - UI：`tokenUsageStatusStore.ts`（zustand）+ `useRootPlatformEffects` 订阅 +
    `v4/composer/tokenUsageStatusBar.tsx`（chips/明细/⚙，localStorage 开关）+
    `ChatPromptEditor` 新增 `bottomContent` 插槽（仅堆叠布局）+ i18n `tokenUsage.*` 双语。
- **口径要点**：total=input+output（不叠 cache/reasoning）；只计 completed；会话均速度只取
  main_turn 加权；上下文容量优先 V4 协议 `usage.contextWindow`（压缩后回落），DB 口径回退；
  今日按本地自然日；子代理按 `session.parent_id`+`query_source='subagent'`。
- **同步策略**：新增文件上游无冲突；`channels.ts`/`platform.ts`/`preload`/`useRootPlatformEffects`
  为 additive 插入，上游演进正常三方合并；`ChatPromptEditor.bottomContent` 插槽若上游重构
  composer 布局需随迁；CLI usage 表 schema 变更（migration）会破坏查询——回归测试
  `tokenUsageSnapshotQuery.test.ts` 用 fixture DB 钉住口径。

### E6. 打开方式定制：Sublime 回归 + 移除清单 + Finder 定位（#30）

- **意图**：会话生成文件/消息文件链接的右键与 Open 下拉——① Sublime Text（macOS）与
  VS 2026（Windows，检测链路 #17 已覆盖 `"18"→2026`）作为**固定入口**出现在打开方式，
  不依赖系统文件关联；② 系统关联里的 QuickTime Player/文本编辑/Numbers/Xcode/备忘录/
  终端 Terminal.app/Chromium 测试与社区变体（Chrome for Testing、Chromium）不再出现，
  **正式版 Google Chrome 与第三方终端（Ghostty 等）保留**；③ **固定收藏顺序
  Sublime Text → Google Chrome 置顶**（收藏优先于系统默认置顶；合并面直显列表不再
  重复标记默认应用，主按钮/中性入口不变）；文件管理器编辑器（finder/explorer）不进
  打开方式列表——与「在 Finder/资源管理器中打开」定位项重复（`showItemInFolder`：
  打开所在目录并选中文件；WSL 走 UNC；Linux 回退打开所在目录）。
- **改动点**：
  - main：`editors.ts`（Sublime 条目回归）；`fileApplications.ts`（删 Numbers/QuickTime
    定义）；**新文件** `fileApplicationVisibility.ts`（移除清单 darwin-bundle id/路径/
    desktop entry 三平台匹配 + 编辑器影子去重：系统条目 key 与白名单编辑器已解析路径
    相同则剔除，避免 VS Code 双条目）；`file-open-apps/index.ts`（导出
    `normalizeApplicationKey`、Options 增 `isExcluded` 谓词，查询与打开共用过滤）；
    `desktopMainIpcPlatform.ts`（装配注入）。
  - UI：`useFileApplications.ts`（`includeInstalledEditors` 选项：合并 `getInstalledEditors()`
    白名单为 `origin:"editor"` 条目、只加载一次、`open()` 按 origin 分发——editor 走
    `openInEditor`，系统走 `openFileWithApplication`；`composeOpenWithApplications` 输出
    固定收藏顺序——收藏 id `finder → sublime` + 系统按显示名精确匹配 `Google Chrome`，
    其余编辑器与系统关联随后，系统侧保持默认优先相对序，并剥离 `isDefault` 标记）；
    `useFileContextActions.ts`（新增 `revealFileInFileManager` 定位语义，与既有
    `revealInFileManager` 打开目录语义并存）；`workspace-file-tree/helpers.ts`（新增
    `getFileManagerEditorId`）；`message.tsx` 与 `OpenSplitButton.tsx`（启用编辑器合并 +
    定位菜单项，文案复用 `appHeader.openInFinder/openInFileExplorer/openInFileManager`）。
  - 测试：APC probe 同步接管 `GetInstalledEditors`（受控场景固定为空）；真实平台断言经
    `composeExpectedOpenWithEntries` 镜像收藏排序与剥离规则。
  - spec：`docs/file-preview-open-apps.md`（打开方式构成、排除规则、收藏排序、定位项）+
    `file-open-apps/CONTRACT.md`（isExcluded 注入）。
- **同步策略**：`fileApplicationVisibility.ts` 为新增文件无上游冲突；`file-open-apps` 的
  `isExcluded` 是 additive 选项；上游若重构 `useFileApplications`/`FileApplicationChoices`
  数据流，注意 `origin` 分发与收藏排序（PINNED 常量）不回退；上游新增编辑器白名单条目
  自动获得固定入口，无需改本特性代码。
- **验证锚点**：手动——mac dev 运行右键 `.sh`/`.xlsx` 文件：直显前二为 Sublime Text、
  Google Chrome；无 Finder/终端/Xcode/文本编辑/Numbers/备忘录/Chrome for Testing；
  VS Code 只有一条；「在 Finder 中打开」定位选中文件；Windows 侧 VS 2026 检测依赖 #17
  既有链路（本机无 Win 环境未实测）。
- **v3.17.2 定位项撞车合并（2026-11-04）**：上游同版本独立实现了同语义定位项
  （`getSystemFileLocatorEditorId` + `reveal` prop，覆盖文件链接、目录链接与产物卡片，
  APC14/15 断言）。按「以远端为主」**整体取上游实现**：本地 `revealFileInFileManager`
  （`getFileManagerEditorId` 版）及其 `canRevealInFileManager`/`handleRevealInFileManager`
  props 已移除，`getFileManagerEditorId` 死代码已删（上游 helper 等价替代）。
  ①固定入口、②移除清单、③固定收藏顺序（`useFileApplications.ts` 的 PINNED 逻辑）不受影响；
  probe/APC e2e 互补合并（本地 `GetInstalledEditors` 固定 + 上游定位 IPC stub）。
  2026-11-09 收口补充：message.tsx 静默存活下来的本地重复定位菜单项一并清除，
  消息链接右键菜单只保留上游单项（对齐 APC `revealCount === 1` 断言）。

### E7. 语音输入仅移除入口（#31，v3.18.0 新功能裁剪）

- **意图**：v3.18.0 引入 composer 语音输入（`packages/ui/src/voice-input/` + 桌面
  `microphone-access` 授权模块 + ASR 链路），个人版不需要，按 B1 先例只移除 UI 入口。
- **改动点**：`ConversationComposer.tsx` 不渲染 `VoiceInputButton`（import 剪除，
  `useComposerVoiceInput` hook 接线保留——不触发录音时完全惰性，getUserMedia 仅在
  toggle 后的采集路径调用）；删除 gating e2e `composer-voice-input.test.ts`（唯一
  消费 `asr-mock-server` 的用例，helper 保留）；`voice-input/` 模块、桌面麦克风授权、
  testids、i18n 全部保留。
- **同步策略**：上游若扩展语音输入（快捷键、设置开关），入口处按同规则不接入；
  若上游把 hook 改为挂载即请求权限，需同步收紧 hook 接线。
- **验证锚点**：grep `VoiceInputButton` 仅剩模块定义无渲染点；typecheck/lint 过。
- **v4.0.0 增量（2026-11-23）**：上游新增语音快捷键（`toggleVoiceInput`，默认
  `Cmd/Ctrl+Shift+D`，由 composer 里的 `useVoiceInputShortcut` 注册，**不依赖按钮是否
  渲染**）和麦克风权限引导。本分支不调用 `useVoiceInputShortcut`（否则没有按钮也能触发
  录音）；`ShortcutSettingsSection` 把 `toggleVoiceInput` 一并隐藏（上游只在 Web 端隐藏；
  命令注册与冲突检测保留，同 `toggleSidePane` 先例）；上游改写后的
  `composer-voice-input.test.ts` 维持删除，其 manifest
  `fixtures/cases/ui-shell/composer-voice-input.json` 留在原地（没有门禁遍历 ui-shell
  manifest）。

### E8. 流式渲染性能（#33/#34）

- **#33 公式渲染缓存**（`1e350ec8`）：KaTeX 从 rehype 管线移到组件层——`message.tsx` 的
  `plugins.math.rehypePlugin` 换成 no-op，`code.math-inline/math-display` 由
  `messageComponents.code` 交给新文件 `cachedKatex.tsx`（`CachedKatexMarkup`，按
  `(latex, displayMode)` 做 LRU 缓存）；```math 围栏经 `mathFenceUnwrapRehypePlugin` 剥掉
  pre 壳。同一提交把逐词浮现的 CJK 单元改成两字一组（`segmentRevealUnits`），
  `chat-loading.tsx` 的 orbs rAF 降到 30fps。
- **#34 滚动条着色**（`5b5e0558`）：`styles.css` 的 thumb 着色改为
  `[data-scrollbar-active]::-webkit-scrollbar-thumb` 直接匹配，删除 `@property` 注册与
  `--zcode-scrollbar-thumb` 变量传递；`WorkspaceShellLayout.setVisible` 去掉 WAAPI 变量动画。
- **同步策略**：`cachedKatex.tsx` 是自建文件，`architecture-policy.yaml` 登记了单文件例外
  （`6330e8e5`）。上游改 `message.tsx` 的公式管线、`streamdownPlugins`、
  `messageComponents.code` 或滚动条样式时要保住这两处。v4.0.0 同步先例（2026-11-23）：
  `message.tsx`、`WorkspaceShellLayout.tsx` 冲突先按 #23 等规则解，再把这两个提交的 diff
  叠回去（`git apply --3way`）。

---

## F. 工程设施（#28/#29）

- **CI**（`.github/workflows/build-desktop.yml`）：push 到 `personal/myagent-v2`（paths-ignore
  docs/md）或手动触发；win x64 + mac arm64 双 job，产物发 GitHub Release
  （`build-N` tag，gh release 撞车重试）。与上游版 bundle 兼容（mac 会多产自动更新 zip，
  不上传）。**依赖**：`pnpm --filter @zcode/desktop bundle`。
- **staging 镜像**：origin 的 `staging` 分支 = main 镜像，是 affected 测试的基线锚点
  （上游内部 staging 在 fork 不存在）。**每次同步 main 后执行**：
  `git push --no-verify origin main:refs/heads/staging`
- **架构基线**（`.architecture-baseline.json`）：10 个定制新文件按 `managed:false` 包的
  同构模式登记（FileManagerPane、previewPaneHtmlContent、windowsCuaOperationIndicatorContent、
  workflowArtifactOpen、officeSuggestedPrompts + 状态条 5 个：tokenUsageSnapshotQuery、
  tokenUsageStatusPump、token-usage、tokenUsageStatusStore、tokenUsageStatusBar）。上游若正式
  受管这些目录，可迁移到 `architecture:adopt`。**坑**：`baseline:update --changed` 会整体替换
  变更闭包内旧条目（两次实测各误删 3 条），使用后必须核对旧条目仍在。
- **pre-push 门禁链**：worktree 干净 → e2e targets → lint → stale-phrases → db schema →
  architecture → affected tests。**勿用 --no-verify 推代码分支**（仅 staging 镜像例外）。
- **覆盖盲区（2026-11-23 踩到）**：根 `pnpm typecheck` 不含 `apps/zcode-cli`。合并改到
  CLI 内核时另跑 `pnpm --filter @zcode/core... build`，再到 `apps/zcode-cli/packages/core`
  跑 `pnpm exec vitest run tests`——工作区依赖经 `dist` 解析，必须先 build；本次一个多余的
  `}` 只在 vitest 解析阶段暴露。
- `pnpm test:engineering:affected --scope push` 与 `verify:pre-push` 都要求工作区干净：
  合并先提交再跑，失败则修补后 amend。
- 大合并后受影响选择器会把工程测试选成整套，然后**跳过不跑**（日志：「Vitest 官方选择了
  整个工程套件…已跳过工程测试，不因此阻止 Push」），门禁照样退出 0。看到这行就手动跑
  `pnpm test:engineering`（v4.0.0 合并实测 180 个规格过 / 3 跳过）。
- typecheck 报 TS6305/TS7006（`packages/desktop/out/app-control-navigation/*.d.ts` 缺失）
  是本地增量产物过期，与代码无关：
  `./node_modules/.bin/tsc -b packages/desktop/tsconfig.app-navigation.json --force`。

---

## G. 增量同步 SOP（每次 main 有新 sync 时）

**先对齐 fork 远端**：`git fetch --all`，本地 `personal/myagent-v2` 落后
`fork/personal/myagent-v2` 时先快进，合并必须做在远端最新提交上。先例：2026-11-09、
2026-11-23 两次在过期的本地分支上合并，只能推倒重来。

```bash
git fetch upstream
git checkout main && git merge --ff-only upstream/main && git push
git push --no-verify origin main:refs/heads/staging        # 更新测试基线镜像
git checkout personal/myagent-v2 && git merge main
```

解冲突按类型套先例：

| 冲突模式 | 解法（均有先例） |
|---|---|
| i18n 品牌串 vs 上游新增键 | 保留上游全部键；冲突行取本地品牌串 |
| 上游删测试（DU/UD）| 跟随上游删除（App 业务单测已退役是上游政策）|
| prompt 结构重构 | 保留上游机制（deliveryNotice/常量抽取/段落精简），套用定制措辞 |
| 上游把功能移到新文件 | 定制随迁到新位置（先例：编辑器行号 → message/OpenSplitButton）|
| 图标/二进制 | `git checkout --ours` |
| 上游新增 UI 入口/新功能 | 默认保留；仅维持本档案记录的既有移除 |
| 上游原生实现了本分支的定制（功能撞车） | 上游是超集就整体取上游，定制只留上游没有的部分（先例：#30 定位项、#23 行号跳转） |
| 上游新功能挂在本分支已裁剪的入口上 | 入口不接入，设置里对应的改键项一并隐藏（先例：#31 语音快捷键） |
| 语义冲突拿不准 | 查本档案对应条目的「同步策略」；仍不明 → 以「上游新功能跟随上游、定制意图不变」为准 |

同步后必做：品牌残留检查（§A3，全文件 grep 值，不能只看冲突块）→ `pnpm typecheck &&
pnpm lint` → CLI 内核有改动时 build + core 测试（见 F）→ 提交合并 →
`pnpm test:engineering:affected --scope push`（被选成整套而跳过时改跑
`pnpm test:engineering`）→ push（门禁自动跑）→ 打 tag
（如 `myagent-v2-<版本>`）。GitHub Actions 自动出安装包。

本地回放 e2e 的坑：报 chromedriver「browser folder exists but the executable is missing」
时，是 `$TMPDIR/chromedriver/<平台>-<版本>` 留了空壳目录，`rmdir` 掉该目录后重跑即可。

## H. 刻意不移植的历史改动（同步时勿"顺手恢复"）

全仓库 2→4 空格重排版、删全部测试与基础设施、删包/Docker/文档、拆架构治理与 pre-push
门禁、安装包瘦身排除名单、手工"摘入上游"式合并。完整清单与理由见
[MYAGENT-DIVERGENCE.md](./MYAGENT-DIVERGENCE.md) §6。

## I. 上游 v4.0.0 默认行为 × 本分支裁剪（未处理，待决策）

2026-11-23 同步时发现，都没有改代码，等使用者裁决。

- **预装工具默认开启**：首次启动后台从 `cdn-zcode.z.ai` 串行下载 Python / qpdf / Pandoc /
  Poppler / LibreOffice（mac arm64 下载约 576 MB、占盘约 1.66 GB），写
  `~/.zcode/preinstalled-tools/`，Agent 子进程 PATH 最前面是它的 `bin`。管理入口在
  「帮助 → 预装工具」；本分支顶栏帮助按钮已隐藏，只能从设置页的帮助菜单进。
- **凭据自动重置**：系统凭据库拿不到密钥时（钥匙串被拒或锁定、Credential Manager 满、
  无 Secret Service），Main 备份后清空全部凭据，无界面提示，需重新登录。本分支与官方版
  共用 appId 与 `~/.zcode`；MyAgent 构建未签名，若因此读不到官方版创建的钥匙串条目，
  可能触发这次清空（推断，未复现）。
- **项目目录插件需手动信任**（已处理）：`plugins.dirs` 声明的插件要在「设置 › 插件 › 项目」
  逐个信任后才对新会话生效。原先本分支隐藏了 `plugin` 分区、没有信任入口；2026-11-23 起
  分区恢复可见（B4），侧栏插件市场按钮仍不恢复。
- **营销弹窗**：官方后台向新 profile 下发 `cloud-content-dialog`（「全新登场…开始体验」）。
  与 #11/#12 移除的推荐入口是同一类触点，是否裁剪待定。
- **Windows CI**：见 DIVERGENCE §4，上游新增的入口 shim 构建脚本硬编码 VS 2022 生成器。
