# Galatea Garden Wake Bridge — Zeabur 安全部署版

这是一个很薄的 Zeabur 部署层：构建时拉取并测试上游
[`galatea-garden-wake-bridge`](https://github.com/WenXiaoWendy/galatea-garden-wake-bridge)，
收到 Garden `wake` 后通过本地 injector 投递到你的 MCP Gateway 私有 HTTP 入口。

## 为什么需要这个部署层

上游 Bridge 的安全约束是：每次 `run` 只建立一次 Garden SSE；任何断线或拒绝都退出，禁止自动重连。
Zeabur 等容器平台会在重启、迁移或 GitHub 更新后创建新容器，因此这里使用
`run-once-and-park` 加持久化单次闩锁：

- 每次连接都必须先由你手动 `arm`，闩锁在建连前立即消耗；
- 闩锁保存在 `/data` 的 Zeabur Volume 中，容器重启不会恢复；
- Bridge 退出后绝不在容器内重新启动；
- 本地健康服务继续返回当前 `stopped` 状态，避免平台形成重连循环；
- 修好原因后，由你手动检查、`arm`，再只重启 Zeabur 服务一次。

健康检查只读取本地进程状态，绝不会连接 Garden。

## 部署前准备

1. 把本目录单独上传到一个新的 GitHub 仓库。
2. 把修改后的 `mcp-gateway-main` 上传到你的网关仓库。
3. 在 Supabase SQL Editor 执行网关仓库中的 `sql/garden_wake.sql`。
4. 在同一个 Zeabur Project 中部署网关和本服务，方便使用私有网络。
5. 在 Bridge 服务的 `Volumes` 页面创建 Volume，Mount Directory 必须填写 `/data`。

没有独立持久 Volume 时，Bridge 会 fail closed，状态显示 `blocked`，不会连接 Garden。

## 网关服务变量

```env
GARDEN_WAKE_ENABLED=true
GARDEN_BRIDGE_SECRET=与Bridge服务的GATEWAY_WAKE_SECRET完全相同
SUPABASE_URL=https://你的项目.supabase.co
SUPABASE_SERVICE_ROLE_KEY=你的service_role密钥

# 可选：配置后 worker 会按 reason 调用只读 Garden MCP 工具获取权威状态
GARDEN_MCP_URL=https://你的Garden-MCP地址/mcp
GARDEN_MCP_TOKEN=你的Garden-MCP凭据
GARDEN_MCP_TRANSPORT=streamable-http

# 网关原有推送与模型变量
TG_BOT_TOKEN=...
TG_CHAT_ID=...
CHAT_API_KEY=...
CHAT_BASE_URL=...
CHAT_MODEL_NAME=...
```

未配置 `GARDEN_MCP_URL` 时，worker 仍会接收并推送唤醒提示，但不会读取 Garden 当前状态。

## Bridge 服务变量

在 Zeabur 的 Bridge 服务 `Variables` 中配置：

```env
GARDEN_MACHINE_TOKEN=Garden签发的机器级token
GARDEN_BASE_URL=https://wake-v1.abysslumina.com
GARDEN_LOG_LEVEL=info

GATEWAY_WAKE_URL=http://网关私有主机名.zeabur.internal:10000/internal/garden/wake
GATEWAY_WAKE_SECRET=一段至少32字节的随机密钥
GATEWAY_WAKE_TIMEOUT_MS=10000
```

`GARDEN_MACHINE_TOKEN` 只由上游 Bridge 用于 Garden SSE 认证，不会被 injector 发送给网关。
不要给 Bridge 服务绑定公网域名；Zeabur 的本地健康检查使用容器端口 `8080` 即可。

## 首次启动与故障恢复

首次部署后 Bridge 会保持 `not_armed`，不会自动连接。确认变量、私网和 `/data` Volume
都正确后，在 Zeabur Web Terminal 执行：

```bash
curl -s http://127.0.0.1:8080/status
node /app/runtime/arm.mjs
```

看到 “armed for exactly one connection” 后，回到 Zeabur 手动点击一次 Restart。
Bridge 成功连接时，`/status` 会显示：

```json
{"status":"running","policy":"persistent-single-use-manual-arm"}
```

如果显示 `stopped`：

1. 查看 Zeabur Runtime Logs，先修复 token、网络或协议错误。
2. 仅在 Bridge 已经停止时，通过 Web Terminal 运行一次：

   ```bash
   node /app/dist/cli.js check
   ```

3. `check` 成功后执行一次 `node /app/runtime/arm.mjs`。
4. 回到 Zeabur，手动点击一次 Restart。

严禁添加循环、cron、watchdog、`restart always`，也不要让健康检查运行 `check`。
不要在 Bridge 正常运行时预先 `arm`；脚本会拒绝这种操作。

## 本地检查

本部署层的 injector 测试不需要 Garden token：

```bash
npm test
```

上游源码在 Docker 构建时固定到 `BRIDGE_REF=f0cd9c2`，并执行上游 `typecheck` 和测试。
升级时先查看上游变更，再有意识地修改 Dockerfile 中的 revision。

## 实际行为边界

当前网关集成会读取 `get_my_status` / `list_notifications` 等权威状态并生成通知；不会自动下棋、
不会自动回复通知，也不会把服务端 wake 文案当 system prompt。需要自动行动时，应在确认游戏规则、
审批边界和写工具白名单后另行实现。
