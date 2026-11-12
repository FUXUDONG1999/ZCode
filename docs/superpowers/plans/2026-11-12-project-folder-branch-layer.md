# 项目文件夹层（侧栏文件夹行 + 分支展示/切换）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 侧栏本地项目行展开后在任务列表上方显示每个 root 的文件夹行，行内显示该文件夹 git 分支并可切换。

**Architecture:** 纯 UI 层改动，收在 `packages/ui/src/project-sidebar/`。复用 `GitBranchSwitcher`（按 `rootPath` 寻址）、`IGitService.getRepositorySummary`、`useGitAutoRefresh`；新组件用 `ServiceProvider` 钉住 `useBaseWorkspaceServices()`，防止远端 tab 激活时 `useServices()` 把本地路径的 git 调用路由到远端 host。无 schema、无 CLI、无协议改动。

**Tech Stack:** React 19 + Zustand（不新增 store）、Radix Collapsible/Popover、wdio E2E。

**Spec:** `docs/superpowers/specs/2026-11-12-project-folder-branch-layer-design.md`

## Global Constraints

- 虚拟项目不变量 I1–I17 全部不触碰；A2（真实目录不是任务导航节点）、A9（新会话 cwd=主要目录）不动。
- 分支信息不落库，实时派生；无 tasks-index/cli schema 变更；CLI 零改动。
- 标识符完整英文单词（`folder`/`summary`/`branch`，禁 `fld`/`br`）；单行 ≤160 字符，未超限不折行。
- i18n 词条 zh-CN 与 en-US 同步新增；UI 内日志用 `@/logger.js`。
- 完成前必须过：`pnpm typecheck`、`pnpm lint`（含 `react/exhaustive-deps` 复核）、`pnpm architecture:check --changed`。
- 交互改动先写 E2E（manual-review/pending）再改实现（仓库 AGENTS.md 规定）。

## Review Focus

1. **非 git / 已删除的 root**：行仍渲染、无分支节点、不抛错（`getRepositorySummary` reject → summary=null）。E2E 覆盖非 git 行（Task 1/3）；删除目录路径手测。
2. **远端 tab 激活时展开本地项目**：git 调用必须走本机 base services（`ServiceProvider` 包裹），不能串到远端 host。Task 3 实现钉住；手测：连一台远程设备并激活其 tab 后展开本地项目切分支。
3. **同仓库的两个 root**：两行显示同分支；在任一行切换会同时变更（git 单工作树本性，预期行为不阻断）。手测项，不做去重。
4. **运行中会话的 cwd 上切分支**：沿用 `switchBranch` 服务端冲突/进行中检查，不加 UI 侧额外阻断。手测项。
5. **手机 /remote 复用侧栏**：文件夹行与切换器在触控下可用（`compactForRemoteControl`、`popoverSide="right"`）。手测项；如遇 popover 溢出再收口宽度。

---

### Task 1: E2E 用例先行（失败）

**Files:**
- Create: `packages/desktop/test/e2e/conversation-session/projects/manual-review/pending/conversation-session-project-folder-branches.test.ts`

**Interfaces:**
- Consumes: `#e2e/helpers/project-sidebar` 的 `selectNativeProjectDirectories`（创建项目并选目录）、`clearAppData` 等既有 helper；参照 `conversation-session-virtual-project.test.ts` 的 HOME 隔离与启动模式。
- Produces: 断言目标 testid——`project-folder-row`（含 `data-folder-path`、`data-primary`），分支行内为 `GitBranchSwitcher` 默认 testid。

- [ ] **Step 1: 写用例**

场景编排：
1. 隔离 HOME 启动应用；在 `testHome` 下准备三个真实目录：`repo-alpha`（`git init` + 初始提交，分支 `main`，另建分支 `develop`）、`repo-beta`（`git init` + 初始提交，分支 `feature-x`）、`plain-folder`（非 git 空目录）。git 操作用 `node:child_process` spawn。
2. 用 `selectNativeProjectDirectories` 依次选入三个目录创建项目（`repo-alpha` 为主要目录）。
3. 点击 `[data-testid="virtual-project-toggle"]` 展开。

断言：
- `[data-testid="project-folder-row"]` 共 3 行；首行 `data-primary="true"` 且 `data-folder-path` 以 `repo-alpha` 结尾。
- `repo-alpha` 行内分支触发器文本含 `main`；`repo-beta` 行含 `feature-x`；`plain-folder` 行内无分支触发器（行存在）。
4. 点击 `repo-alpha` 行分支触发器 → 弹出列表选 `develop` → 触发器文本变 `develop`，且读 `repo-alpha/.git/HEAD` 验证已切到 `develop`。

- [ ] **Step 2: 运行确认失败**

```bash
ZCODE_E2E_MANUAL_REVIEW=1 pnpm --filter @zcode/desktop test:e2e -- --spec './test/e2e/conversation-session/projects/manual-review/pending/conversation-session-project-folder-branches.test.ts'
```

Expected: FAIL，找不到 `project-folder-row`。

- [ ] **Step 3: Commit**

```bash
git add packages/desktop/test/e2e/conversation-session/projects/manual-review/pending/conversation-session-project-folder-branches.test.ts
git commit -m "test: 项目文件夹层 E2E 用例（失败先行）"
```

### Task 2: ProjectFolderRows 组件（行骨架，无分支）

**Files:**
- Create: `packages/ui/src/project-sidebar/ProjectFolderRows.tsx`
- Modify: `packages/ui/src/project-sidebar/ProjectNodeContent.tsx`（CollapsibleContent 内、`ManagedWorktreeCreatingRows` 之前挂载）
- Modify: `packages/ui/src/i18n/locales/zh-CN.ts`、`en-US.ts`（新增 `project.folder.primaryRoot`）

**Interfaces:**
- Consumes: `VirtualProject`（`contract.js`）：`hostId`、`roots: ProjectRoot[]`（`rootPath/position/isPrimary`）；`ProjectTaskListContext` 的 `isWebRemoteControl`；`useBaseWorkspaceServices()`（`@/hooks/useWorkspaceServices.js`）。
- Produces: `export function ProjectFolderRows({ project, expanded }: { project: VirtualProject; expanded: boolean }): ReactNode | null`；行 testid `project-folder-row`、属性 `data-folder-path`、`data-primary`（Task 1 断言依据）。

- [ ] **Step 1: 实现 ProjectFolderRows**

规则：
- `project.hostId !== "local"` 或 `roots.length === 0` 返回 null（远程项目不做，spec 裁决 1）。
- 排序：primary 在前，其余按 `position`。
- 行结构：`Folder`（lucide）图标 + `basename(rootPath)` + `title={rootPath}`（primary 的 title 追加 ` · 主目录`，走 i18n `project.folder.primaryRoot`）。行高与视觉对齐现有 `ProjectTaskRows` 行（h-7~8、`text-ui-sm`、`text-foreground-subtle`、hover `bg-surface-hover`），缩进与任务行对齐。
- 只渲染行骨架；分支位留空（Task 3 填充）。`expanded` 暂不消费也先传入（接口稳定）。

- [ ] **Step 2: 挂载进 ProjectNodeContent**

在 `<div className="pl-2 pt-1">` 内、`<ManagedWorktreeCreatingRows>` 之前：

```tsx
<ProjectFolderRows project={project} expanded={isOpen} />
```

- [ ] **Step 3: 验证**

Run: `pnpm typecheck && pnpm lint`
Expected: 均通过，无新增 `react/exhaustive-deps` 诊断。
Run: Task 1 E2E 命令。
Expected: 3 行与 primary 断言通过；分支断言仍失败（预期）。

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/project-sidebar/ProjectFolderRows.tsx packages/ui/src/project-sidebar/ProjectNodeContent.tsx packages/ui/src/i18n/locales/zh-CN.ts packages/ui/src/i18n/locales/en-US.ts
git commit -m "feat: 侧栏项目展开显示文件夹行骨架"
```

### Task 3: 分支标签与切换（GitBranchSwitcher + 钉住本机服务）

**Files:**
- Modify: `packages/ui/src/project-sidebar/ProjectFolderRows.tsx`

**Interfaces:**
- Consumes: `GitBranchSwitcher`（`@/GitBranchSwitcher.js`，props：`workspacePath/gitSummary/dirtyFileCount/onRefreshGit/popoverSide/compactForRemoteControl`）；`GitRepositorySummary`（`@zcode/shared`）；`ServiceProvider`（`@/hooks/useServices.js`）。
- Produces: 文件内私有 hook `useFolderGitSummary(rootPath: string, enabled: boolean): GitRepositorySummary | null`（Task 4 复用）。

- [ ] **Step 1: 实现 useFolderGitSummary**

参照 `task-row-hover/TaskRowIdentityHoverCard.tsx:309` 的 `useGitBranchLabel`：`enabled && expanded` 时经 `useBaseWorkspaceServices().gitService.getRepositorySummary({ workspacePath: rootPath })` 拉取；失败静默置 null；`rootPath` 变化重置。不复用 hover 卡的本地函数（其绑定 task 结构），但保持同样防抖语义（无防抖，展开时一次）。

- [ ] **Step 2: 行内挂 GitBranchSwitcher**

- `ProjectFolderRows` 顶层用 `<ServiceProvider services={baseServices}>` 包裹全部行：钉住 `GitBranchSwitcher` 内部 `useServices()` 到本机 base，阻断远端 tab 污染（Review Focus 2）。
- summary 非空且 `isRepository`：渲染 `<GitBranchSwitcher workspacePath={rootPath} gitSummary={summary} dirtyFileCount={0} onRefreshGit={refetch} popoverSide="right" compactForRemoteControl={isWebRemoteControl} triggerClassName=紧凑行样式 />`（`dirtyFileCount` 仅影响角标显示，传 0 不显示，无碍切换逻辑）。
- summary 为空或非仓库：不渲染分支节点（Review Focus 1）。
- 行 `title` 保持 rootPath。

- [ ] **Step 3: 验证**

Run: `pnpm typecheck && pnpm lint`
Expected: 通过；复核新 hook 的依赖数组完整。
Run: Task 1 E2E 命令。
Expected: 全部断言通过（含切分支后 `.git/HEAD` 变更）。
手测（Review Focus 2/3/4）：远端 tab 激活后展开本地项目切分支；同仓库双 root；运行中会话 cwd 上切分支。

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/project-sidebar/ProjectFolderRows.tsx
git commit -m "feat: 文件夹行显示分支并支持切换（GitBranchSwitcher 钉本机服务）"
```

### Task 4: 展开期间分支自动刷新

**Files:**
- Modify: `packages/ui/src/project-sidebar/ProjectFolderRows.tsx`

**Interfaces:**
- Consumes: `useGitAutoRefresh`（`@/hooks/useGitAutoRefresh.js`）：`{ workspacePath, workspaceIdentity, remoteSessionId, gitSummary, gitSummaryWorkspaceKey, enabled, onRefreshGit }`；Task 3 的 `useFolderGitSummary`。

- [ ] **Step 1: 接线 watcher**

每个分支行内：

```tsx
useGitAutoRefresh({
  workspacePath: rootPath,
  workspaceIdentity: undefined,
  remoteSessionId: null,
  gitSummary: summary,
  gitSummaryWorkspaceKey: summary.workspacePath,
  enabled: expanded && summary !== null && summary.isRepository,
  onRefreshGit: refetch,
});
```

Hooks 规则：行组件顶层无条件调用（`enabled=false` 时 hook 内部自拆除 watcher），分支节点渲染条件不变。

- [ ] **Step 2: 验证**

Run: `pnpm typecheck && pnpm lint`（重点 `react/exhaustive-deps`）。
手测：展开项目 → 终端在 repo 内 `git switch` → 约 60s 防抖后侧栏标签更新；收起后 watcher 拆除（DevTools 无泄漏告警即可）。
Run: Task 1 E2E（回归）。

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/project-sidebar/ProjectFolderRows.tsx
git commit -m "feat: 文件夹行分支随 git 变更自动刷新（展开期间）"
```

### Task 5: 收口与档案

**Files:**
- Modify: `MYAGENT-FEATURES.md`（新增定制功能条目）
- Modify: `docs/superpowers/specs/2026-11-12-project-folder-branch-layer-design.md`（状态 待确认 → 已实现）

**Interfaces:**
- Consumes: 无新接口。

- [ ] **Step 1: MYAGENT-FEATURES.md 补档案**

按现有条目格式新增：意图（多文件夹项目按文件夹看/切分支）、改动点（ProjectFolderRows/ProjectNodeContent/i18n/E2E）、适配决策（远程项目不做、ServiceProvider 钉 base、不落库）、验证锚点（E2E 文件路径 + 手测项）、同步先例（无 schema/CLI 改动，上游合并时仅 UI 文件冲突）。

- [ ] **Step 2: 全量门禁**

```bash
pnpm typecheck && pnpm lint && pnpm fmt:check && pnpm architecture:check --changed
```

Expected: 全部通过；架构无新增违规。

- [ ] **Step 3: Commit**

```bash
git add MYAGENT-FEATURES.md docs/superpowers/specs/2026-11-12-project-folder-branch-layer-design.md
git commit -m "docs: 文件夹层档案与 spec 状态收口"
```
