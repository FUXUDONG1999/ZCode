# Token 用量状态条（固化 zcode-token-usage-statusbar）

## 概述

将第三方插件 [ByteRax/zcode-token-usage-statusbar](https://github.com/ByteRax/zcode-token-usage-statusbar)
固化为桌面客户端内置功能：底部浮层实时展示 token 用量（生成速度 / 上下文占比 / 本轮 /
会话累计 / 工具调用 / 今日合计 / 子代理）与 ⚙ 设置面板。

固化的含义：**主进程原生加载插件运行时，不再依赖 `install.py` 向 app.asar 注入**；
应用升级或重装后自动生效。vendored 副本位于
`packages/desktop/resources/token-usage-statusbar/`（pin 上游 commit，见目录内 NOTICE），
随 electron-builder `extraResources` 进包。

范围决策（2026-11-02）：

- **不注册** MCP `token_usage` 服务与 `/usage` 命令——不写 `~/.zcode/cli/config.json`
  与 `~/.zcode/commands/`；
- 插件自更新 `plugin_auto_update` 种子默认 `false`，版本由 fork 构建掌控；
- vendored 文件**逐字节保留上游原样**，不在 fork 内修改（升级 = 重新 vendor）。

## 规则与边界

- 数据链：插件只读 `~/.zcode/cli/db/db.sqlite`（CLI 所有，WAL 模式），常驻
  `zusage.py serve` 查询泵 + fs.watch 事件驱动刷新，空闲零轮询。fork 不引入第二写入方。
- 前置依赖：系统 `python3`（macOS CLT 自带）。缺失时状态条无数据，客户端不受影响
  （插件侧任何失败只打日志）。
- fork 重建产物上的既有降级（上游按官方客户端指纹锁定，fail-closed，非本定制引入）：
  - 分栏级会话归属与确定性逐问速率行（`renderer_bridge.py` 资产指纹不匹配 → 回退 DB 口径）；
  - 自动压缩阈值引擎补丁（`engine-patch.cjs` 引擎 SHA 白名单不匹配 → 不启用）。
- 熔断：环境变量 `ZCODE_TOKEN_STATUSBAR_DISABLE=1` 时加载器整体 no-op。

## 状态所有者与事件顺序

```
App 启动（main process）
  │ app.whenReady()
  ▼
installTokenUsageStatusbar(tokenUsageStatusbar.ts，唯一入口)
  │ 1. 解析种子目录：打包态 process.resourcesPath/token-usage-statusbar；
  │    开发态仓库 packages/desktop/resources/token-usage-statusbar
  │ 2. 种子同步 → ~/.zcode/zcode-token-usage-statusbar/（真实 HOME，不随 dataBaseDir 迁移）
  │    规则（按 .fork-seed.json 记录的 sha256 逐文件判定）：
  │      目标缺失 → 复制；内容 == 上次种子记录 → 允许覆盖（升级）；
  │      内容 != 记录 → 用户/插件改过，保留不动
  │    config.json 永不覆盖；首次运行生成 {"lang":"zh","plugin_auto_update":false}
  │ 3. require(运行目录/inject-main.cjs)（原子性：createRequire + try/catch）
  ▼
插件运行时（上游逻辑，fork 不改）
  ├─ 向各窗口注入 turn-stats.js + overlay.js（executeJavaScript，mtime 热重载）
  ├─ 常驻 python3 zusage.py serve（stdin/stdout 行协议，意外退出自动重启）
  ├─ fs.watch ~/.zcode/cli/db → 查询 → 按窗口推送快照
  └─ 任何失败仅 console.error [zusage]，不影响客户端
```

所有者：种子内容归 fork 构建；运行目录文件归插件/用户（本 fork 只做"缺失或未改动才覆盖"
的同步）；`config.json` 归用户（⚙ 面板写入）。

## 验收场景

1. 首次启动：运行目录被完整种子化，`config.json` 生成且含 `plugin_auto_update:false`；
   状态条出现在窗口底部，⚙ 面板可切换条目并持久化（重启后保留）。
2. vendored 升级：种子文件内容变化 → 未被用户改动的文件被覆盖为新版；用户改过的文件保留。
3. 运行任务产生请求后，速度/本轮/会话等条目有数据；多窗口各自只显示本窗口会话。
4. `ZCODE_TOKEN_STATUSBAR_DISABLE=1` 启动：无状态条，运行目录不被创建/修改。
5. `~/.zcode/cli/config.json` 与 `~/.zcode/commands/` 无任何写入。
6. 移除 `python3`（或 PATH 无 python3）时客户端正常使用，仅状态条无数据。

## 相关代码

| 位置                                                | 职责                                          |
| --------------------------------------------------- | --------------------------------------------- |
| `packages/desktop/src/main/tokenUsageStatusbar.ts`  | 种子同步 + 原生加载（唯一 fork 侧实现）       |
| `packages/desktop/src/main/index.ts`                | whenReady 内一次调用（fire-and-forget）       |
| `packages/desktop/resources/token-usage-statusbar/` | vendored 上游运行时（不修改）+ LICENSE/NOTICE |
| `packages/desktop/electron-builder.config.js`       | extraResources 条目                           |
| `packages/desktop/test/tokenUsageStatusbar.test.ts` | 种子同步回归测试                              |
