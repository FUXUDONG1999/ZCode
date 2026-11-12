# 项目文件夹层（分支展示与切换）设计

日期：2026-11-12
状态：已实现（提交 `b1417b0a`/`cada0f4e`/`05ace97f`；E2E `conversation-session-project-folder-branches` pending 回放通过）
关联：`docs/superpowers/specs/2026-09-09-virtual-project-design.md`（A2/A9 裁决）、`.agents/skills/session-management/SKILL.md`（不变量）

## 意图

多文件夹项目里每个文件夹（root）常是独立 git 仓库、各有分支。侧栏只显示项目行，看不到文件夹，更没法按文件夹看分支、切分支。补一层"项目可展开 → 文件夹行"的操作层。

## 目标

- 项目行可展开/收起，展开后每个 root 一行。
- 文件夹行显示当前分支，点击分支弹出现有 `GitBranchSwitcher` 下拉（复用，`workspacePath=rootPath`），支持切分支、新建分支。

## 非目标（反目标）

- 不做文件夹级任务列表或任务归属——任务仍归项目（不动 tasks 表、分组/置顶/未读/手机同步链）。
- 不改 A9：项目内新建会话 cwd 仍为主要目录。
- 不做"文件夹加入对话"新机制——项目会话已把全部 roots 作为 `additionalDirectories` 传入（env prompt 可见、可读写），现状已满足"针对文件夹提问"。
- 不恢复旧两级目录切换器：文件夹是操作层，不是任务导航层（维持 A2 边界）。

## 约束

- 不变量 I1–I17 全部不触碰；无 schema 变更；CLI 零改动（I4）。
- 分支信息不落库：与现状一致，由 `IGitService.getRepositorySummary` 按路径实时派生。

## 方案

只有一条合理路径：数据零改动，纯侧栏 UI。

- 数据：`project_roots` 已有全部所需（rootPath、position、isPrimary）；分支实时拉取，展开时加载、展开期间随 watcher 刷新（沿用 `useGitAutoRefresh` 模式）。
- UI：`ProjectNode` 增加展开箭头；新增 FolderNode 行（文件夹名 + 分支标签），分支标签点击弹 `GitBranchSwitcher`（组件本就接受任意 `workspacePath`）。
- 切分支沿用现有 `switchBranch` 的冲突/进行中操作检查，不因会话运行中额外阻断。

否决的备选：分支操作收进 hover/右键菜单——分支不可见，与"显示各自分支"诉求不符。

## 默认裁决（可在确认时推翻）

1. v1 只做本地项目；远程项目单 root 且有离线约束，不做这层。
2. 展开/收起用独立箭头，项目行点击行为不变。
3. 非 git 文件夹只显示名字、无分支标签；同一仓库的多个 root 各自显示（天然同分支）。
4. 手机端 `/remote` 复用同一 `ProjectSidebar`，自然获得（`GitBranchSwitcher` 已有 `compactForRemoteControl`）。

## 验收场景

交互改动，先补 E2E/浏览器验收再改实现：本地多 root 项目 → 展开见文件夹行与各自分支 → 在某文件夹行切分支 → 工作区头部分支标签、git 面板同步刷新；非 git root 只显名字；手机端同页面可用。
