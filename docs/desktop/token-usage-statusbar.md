# Token 用量状态条（原生实现）

## 概述

composer 卡片内的 token 用量状态条：生成速度（三档配色）/ 上下文容量 / 本轮 / 会话累计 /
工具调用（错误红点）/ 今日合计 / 子代理（运行蓝点），每条目悬停明细，⚙ 弹层逐项开关
（localStorage 持久化）。

历史：曾按 vendored 方案固化上游插件 zcode-token-usage-statusbar（主进程 require
inject-main.cjs + executeJavaScript 注入 overlay.js），实测其渲染侧 DOM 探测在 fork 构建
产物上失效且机制脆弱，已 revert，改为按其统计口径**原生重写**（2026-11-02 决策）。

## 架构与数据流

```
CLI（所有者：usage 表，WAL）
  └─ ~/.zcode/cli/db/db.sqlite（model_usage / turn_usage / tool_usage / session）
       │ fs.watch db 目录（300ms 去抖）+ 30s 心跳兜底；空闲且无焦点会话 = 零查询
       ▼
桌面主进程 tokenUsageStatusPump（packages/desktop/src/main/）
  ├─ 连接：node:sqlite 只读 + busy_timeout=2000，按次开关
  ├─ 查询：tokenUsageSnapshotQuery（纯函数，注入 DatabaseSync，口径见下）
  ├─ 窗口归属：监听 zcode:sync-active-task-session（客户端自有通道），
  │   维护 webContents.id → 焦点会话映射；窗口销毁自动剔除
  └─ 推送：PlatformChannels.TokenUsageSnapshot → 各窗口（sessions=全部窗口焦点会话并集）
       ▼
渲染层 packages/ui
  ├─ preload zcode.onTokenUsageSnapshot → IPlatformService.onTokenUsageSnapshot（可选成员）
  ├─ useRootPlatformEffects 订阅 → tokenUsageStatusStore（模块级 zustand）
  └─ TokenUsageStatusBar（ConversationComposer → ChatPromptEditor bottomContent 插槽）
      按 sessionId 取快照；上下文容量优先用 V4 协议 snapshot.usage.contextWindow
      （服务端驱动、随模型/压缩回落），缺席回退 DB 口径
```

无平台实现（web）时 store 保持空，状态条不渲染；会话零请求且今日为零时整条隐藏。

## 统计口径（移植自 zusage.py，见 tokenUsageSnapshotQuery.ts）

- total = input + output；input 已含 cache_read、output 已含 reasoning，不得再叠加
- 只计 `status='completed'`；轮数 = distinct turn_id
- 速度：加权 Σ输出 ÷ Σ生成窗口；普通请求生成窗口 = completed_at−first_token_at，
  reasoning>0 或 Claude 系模型 = completed_at−started_at；有效样本窗 200ms~1h；
  会话均只取 main_turn 行；最近请求无效时向前回看 20 条
- 会话总量含辅助请求（标题生成等）；速度与上下文口径只取 main_turn
- 上下文：V4 协议 contextWindow 优先；DB 口径 = 最近完成 main_turn 请求的 input
  （压缩后可回落）；context_exceeded 晚于最近成功请求时闪红
- 今日：本地自然日 `[零点, 零点+1d)`；子代理：session.parent_id + query_source='subagent'，
  30s 内有完成请求视为运行中
- DB 数据保留 30 天（CLI pruneUsage），状态条只查当日/当会话，不受影响

## 验收场景

1. 打开有历史的会话：卡片底部出现状态条，各条目出数；悬停看五路分解
2. 跑一个小任务：速度/本轮/会话/工具随请求完成刷新（事件驱动，无轮询抖动）
3. ⚙ 关闭某条目 → 刷新后仍记住（localStorage）
4. 多窗口各显各的焦点会话；切换会话立即出数（不等 DB 变化）
5. 压缩/换大窗口模型后上下文占比回落（协议口径）
6. web 环境/无数据会话不渲染；DB 缺失或查询失败只告警不影响客户端
7. 回归：packages/desktop/test/tokenUsageSnapshotQuery.test.ts（口径断言）

## 相关代码

| 位置                                                   | 职责                                                 |
| ------------------------------------------------------ | ---------------------------------------------------- |
| `packages/shared/src/token-usage.ts`                   | 快照契约（zod）+ PlatformChannels.TokenUsageSnapshot |
| `packages/desktop/src/main/tokenUsageSnapshotQuery.ts` | 只读查询与口径                                       |
| `packages/desktop/src/main/tokenUsageStatusPump.ts`    | fs.watch 泵 + 窗口映射 + 推送                        |
| `packages/ui/src/store/tokenUsageStatusStore.ts`       | 渲染侧快照 store                                     |
| `packages/ui/src/v4/composer/tokenUsageStatusBar.tsx`  | 状态条 UI（chips/明细/⚙）                            |
| `packages/ui/src/prompt-editor/ChatPromptEditor.tsx`   | bottomContent 插槽（堆叠布局）                       |

## 后续迭代候选

流式生成中的实时估算速度、子代理点击详情面板、额度 chip（需凭据链路评估）、
上下文超限弹窗建议（回滚/换模型/新会话）。
