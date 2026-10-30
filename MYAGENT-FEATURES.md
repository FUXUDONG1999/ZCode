# MyAgent v2 功能特性档案

> **用途**：`personal/myagent-v2` 全部个人定制的逐项档案——每个功能的意图、改动点、
> v2 重放时的适配决策、后续增量同步策略与验证锚点。每次 `git merge main` 解冲突时，
> 先查本文档对应条目，再按 [MYAGENT-DIVERGENCE.md](./MYAGENT-DIVERGENCE.md) 的速查表裁决。
>
> **基线**：v2 基于 main `a60ba6a7`（2026-10-30 上游同步）+ 下列提交；功能基线为旧分支
> `4c14c7bd`（2026-10-29，今天之前的最后状态）。旧分支 10-30 的两个吸收提交
> （`00655193`/`e840f1f5`，遗留 22 个类型错误）已废弃、不含于 v2。

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
| 23 | 文件链接定位到行 + HTML 侧边预览 | `2a7a809d` | 桌面能力 | markdownFileLink（lineNumber）|
| 24 | 主进程日志异步批量落盘 | `bfa51bd0`+`5b0b78ad` | 性能 | logger.ts（PENDING_LOG_LINE_LIMIT）|
| 25 | 恢复设置页「归档管理」入口 | `a1fcb99a` | UI | settingsNavigation（archives 可见）|
| 26 | 会话轮次 token 生成速度 | `e787410d` | UI 功能 | 消息行/工具条徽标（需运行任务）|
| 27 | 隐藏「数据同步」设置分区 | `34c723b1` | UI 裁剪 | settingsNavigation（dataSync 隐藏）|
| 28 | 个人构建工作流（CI）| `34c723b1`+`412b75c4` | 工程 | GitHub Actions build-desktop |
| 29 | 架构基线登记 5 个定制新文件 | `31f92ef7` | 工程 | .architecture-baseline.json |

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

- 当前残留：仅 i18n key 名含 ZCode（`toggleZCodeStdioTap`、`openInZCode`）——key 是代码
  标识，**不改**。值中残留 = 0（与旧分支基线一致）。
- **每次同步 main 后执行**：
  ```bash
  grep -n "ZCode" packages/ui/src/i18n/locales/zh-CN.ts packages/ui/src/i18n/locales/en-US.ts
  # 值中出现的逐条替换为 MyAgent（key 名不动）；再全仓抽查新增 UI 文案
  git grep -n "ZCode" packages/web/src packages/desktop/src/main -- '*.ts' '*.tsx' | grep -v test
  ```
- 已知改过的非 i18n 品牌点：`desktopLinuxDeepLinkRegistration`（桌面文件名）、
  `webAuthLocale`、`ConversationShareLandingPage`、`officeSuggestedPrompts`。

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
- **#22 预览仅内容**（`69564f69`，原 `0381cb28` **v2 适配版**）：
  - 新增 `packages/ui/src/FileManagerPane.tsx`：只渲染 PreviewPane + 空态。
  - 面板接线：`AnimatedSidePanePanel` 的 code-viewer/file-manager Tab 渲染新组件，
    移除 `onNavigateFileManager` 链（panel/types/App/useAppPanels 四处）。
  - **与原提交的差异（重要）**：上游 workspace-file-tree 家族 19 文件、`WorkspaceFileTree.tsx`、
    store 的 fileManagerNavigation 偏好、3 个 e2e 用例**全部保留**（上游活跃开发，不删）。
- **同步策略**：上游若重构侧面板体系，#21/#22 的接点集中在
  `AnimatedSidePanePanel.tsx` 一个文件；`FileManagerPane.tsx` 是自建文件无冲突。

### B4. 菜单与配色（#4/#11/#12/#19/#25/#27）

- **账户菜单**（`60292fda`）：移除「界面语言/主题/模式/缩放」子菜单与「邀请好友」；
  Rewards 能力保留。改动 `WorkspaceSidebarFooter.tsx`（两处「个人定制」注释为锚点）。
- **任务页**（`0da194ca`）：`styles.css`（One Dark Pro 调色板，深色主题整体加深一档，
  注释锚点 styles.css:683）；移除推荐/帮助入口（`WorkspaceHeader`/`SessionPane`）。
- **设置分区显隐**（`settingsNavigation.ts` 的 `HIDDEN_SETTINGS_SECTIONS`，**单一控制点**）：
  - 隐藏：`browser`、`remoteDevices`、`computerUse`、`plugin`、`automations`、`plugins`、
    `workspaceFileSearch`、**`dataSync`**（#27，数据同步=同步本机配置到远端设备，2026-10-30 决定隐藏）
  - 可见：**`archives`**（#25 归档管理，2026-10-29 恢复）
  - 恢复/隐藏任一分区 = 从该 Set 增删一行，页面与数据层不动。
- **macOS 打开方式菜单**（#19）：`editors.ts` 中 Sublime Text 与 Terminal/iTerm/Ghostty
  条目删除；Windows 侧不动。

### B5. 窗口按钮（#10，`97ee7e0f`）

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

- **#7 同轮打包**（`585d0761`）：`identity.ts` Harness 块第 4 条 bullet 升级为
  「If you intend to call multiple tools… make all of the independent calls in the same
  response — batch independent commands and file reads in one turn…」；`bash-prompt.ts`
  同步。先例：上游引入 `deliveryNotice` 变量时保留了该机制、只改并行条目措辞。
  Harness bullets 数量=5 有断言（context-builder）。
- **#8 分层指引**（`fdd028df`）：Read 条件式（任务围绕该文件→全读；否则 offset/limit）；
  Grep「先 files_with_matches 定位、再 content 精读」；Agent 委派阈值（>3 次查询的宽泛
  调研→subagent_type=Explore）。先例：上游改 Read 描述行时取定制版（语义超集）。
- **#9 多代理并发**（`25a6443c`）：Agent 描述 When-to-use 段加同轮多 agent 并发指引。
- **#15 ToolSearch 直调提示**（`639a16b7`）：deferred 未命中但常驻工具命中时，回填
  「These tools are already loaded (resident) — call them directly…」。实现横跨
  contracts（schema `resident_matches`）/handler（searchResidentTools）/format 三层；
  纯未命中跟随上游长文案（断言已对齐）。
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
- **#23 行号定位 + HTML 预览**（`2a7a809d`，**部分适配**）：
  - 完整保留：`markdownFileLink.ts`（`path:line` 解析→`lineNumber`）、`codeViewer.ts`
    （`revealLine`）、`previewPaneContent.tsx`（滚动定位）、`previewPaneHtmlContent.tsx`
    （新文件：HTML 侧边渲染）、`platform.ts` 的 `OpenInEditorOptions.line`、
    `openInEditor.ts`（VS Code --goto / JetBrains --line）、message.tsx/OpenSplitButton
    调用点传参。
  - **已废弃部分**：原 PreviewPane 内的 `handleOpenInEditor`（上游已把「用编辑器打开」
    移出该组件），hunk 不再适用——行号传参已由上游新调用点承担。
- **#24 异步日志**（`bfa51bd0`+`5b0b78ad`）：行进内存队列、setImmediate 合并、
  每-文件链式 Promise、退出同步兜底、缓冲上限 2000；`exportLogs.ts` 配套。
  上游若改日志格式/TTFT 分流，注意保留 `ensureLogDirectory` 与退出兜底链路。

---

## F. 工程设施（#28/#29）

- **CI**（`.github/workflows/build-desktop.yml`）：push 到 `personal/myagent-v2`（paths-ignore
  docs/md）或手动触发；win x64 + mac arm64 双 job，产物发 GitHub Release
  （`build-N` tag，gh release 撞车重试）。与上游版 bundle 兼容（mac 会多产自动更新 zip，
  不上传）。**依赖**：`pnpm --filter @zcode/desktop bundle`。
- **staging 镜像**：origin 的 `staging` 分支 = main 镜像，是 affected 测试的基线锚点
  （上游内部 staging 在 fork 不存在）。**每次同步 main 后执行**：
  `git push --no-verify origin main:refs/heads/staging`
- **架构基线**（`.architecture-baseline.json`）：5 个定制新文件按 `managed:false` 包的
  同构模式登记（FileManagerPane、previewPaneHtmlContent、windowsCuaOperationIndicatorContent、
  workflowArtifactOpen、officeSuggestedPrompts）。上游若正式受管这些目录，可迁移到
  `architecture:adopt`。
- **pre-push 门禁链**：worktree 干净 → e2e targets → lint → stale-phrases → db schema →
  architecture → affected tests。**勿用 --no-verify 推代码分支**（仅 staging 镜像例外）。

---

## G. 增量同步 SOP（每次 main 有新 sync 时）

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
| 语义冲突拿不准 | 查本档案对应条目的「同步策略」；仍不明 → 以「上游新功能跟随上游、定制意图不变」为准 |

同步后必做：品牌残留检查（§A3）→ `pnpm typecheck && pnpm lint` →
`pnpm test:engineering:affected --scope push` → push（门禁自动跑）→ 打 tag
（如 `myagent-v2-<版本>`）。GitHub Actions 自动出安装包。

## H. 刻意不移植的历史改动（同步时勿"顺手恢复"）

全仓库 2→4 空格重排版、删全部测试与基础设施、删包/Docker/文档、拆架构治理与 pre-push
门禁、安装包瘦身排除名单、手工"摘入上游"式合并。完整清单与理由见
[MYAGENT-DIVERGENCE.md](./MYAGENT-DIVERGENCE.md) §6。
