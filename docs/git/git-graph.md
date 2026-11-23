# Git Graph

Git Graph 是 Git 操作下拉菜单里的只读提交图入口，用于查看当前仓库最近提交、分支泳道、merge 边和 refs。

## 设计边界

- UI 只通过 `IGitService.getCommitGraph({ workspacePath, maxCount, skip })` 分页消费结构化数据，不直接调用 Git CLI。
- services/repo 层使用 `git log --all --topo-order --date-order` 读取 commit、parents、refs、author 和时间。
- `layoutGitGraph(commits)` 是纯函数，输入 topo/date 排序后的提交，输出行坐标、lane、edge path 和截断状态。
- SVG renderer 只负责展示节点、线、hover、selected、ref chip；窗口外 parent 用 dashed edge 表示截断。
- UI 使用 `DESIGN.md` 的语义 token，避免新增图形库，兼容桌面端和 Web 端主题。
- 弹窗保持固定高度。少量提交时，左侧图轨列的背景与右分隔线延伸到列表可视区域底部；节点和连线不拉伸。大量提交时由列表统一滚动，图轨与提交行保持对齐。

## 当前限制

- 默认每页加载 50 条提交，点击“加载更多提交”后通过 `skip` 读取下一页；repo 层单页最多允许 200 条。
- 当前入口是弹窗视图，暂不做无限滚动、搜索、checkout 或 diff 联动。
- 空仓库返回空列表，UI 显示空状态。

## 个人定制：按作者和路径筛选（personal/myagent-v2，2026-11-23）

覆盖上节「暂不做搜索」。登记见 `MYAGENT-FEATURES.md` B7、`MYAGENT-DIVERGENCE.md` §2。

- **请求**：`IGitService.getCommitGraph` 增加可选的 `author` 和 `path`，`maxCount` / `skip` 分页口径不变，筛选在 git 侧
  生效后再分页。两个值都缺省时命令与结果和筛选前完全一致。
- **作者**：非空时传 `--author=<值>`，配合 `--fixed-strings --regexp-ignore-case`，按字面匹配作者名或邮箱、不区分大小写。
  输入框里按普通文本处理，不把用户输入当正则。
- **只看我的**：UI 用 `IGitService.getIdentity` 取仓库身份，把 `user.email` 填进 `author`（没有邮箱时退回 `user.name`）。
  身份两者都没有时开关禁用并给出提示。开关打开期间作者输入框禁用，关闭后恢复原输入。
- **路径**：仓库根目录的相对路径。服务层统一成正斜杠并去掉首尾空白和斜杠；空串视为未筛选；含 `..` 段的路径在
  服务层抛错，不下发到 git。其余路径加 `:(literal)` 前缀作为 pathspec 跟在 `--` 之后，目录名里的 `[`、`*` 按字面匹配。
- **展示**：任一筛选生效时切到纯列表，不渲染泳道列和 SVG，只留描述、日期、作者、提交四列；清除筛选后恢复分支图。
  筛选后没有匹配提交时显示「没有匹配的提交」，与「暂无提交」区分。
- **状态归属**：筛选输入是 `GitGraphDialog` 的本地状态，关闭弹窗即丢弃。文本输入 300ms 防抖后生效，回车立即生效，
  开关和清除立即生效。请求沿用 `requestGenerationRef` 代次校验，迟到的旧结果不落地。
