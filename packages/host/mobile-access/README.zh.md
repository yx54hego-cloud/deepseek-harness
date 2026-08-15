# `@deepseek-ai/dsh-host-mobile-access`

[English](README.md) | 中文

面向 DeepSeek Harness 最小手机伴侣的已认证、端到端加密 WebSocket 载体。该载体使用独立于浏览器服务器的监听端口，并复用 `ctx.apiProxy` 提供 Session 列表、分页历史、每个 Session 的模型目录与选择，以及 queue 模式下包含文字和图片的 `session.prompt`。载体专用的 `mobile.archivedSessions` 只返回全局归档 Session id。实时流只转发让手机保持最新所需的 Session 事件、标题、运行状态与归档集合变化。浏览器路由、文件、终端、工具、设置、工作区内容与操作、审批以及响应接口均不会暴露。

Web bundle 会在 `0.0.0.0:6769` 启用该插件，使用操作系统默认路由选择的 IPv4 地址生成配对信息，并打印 `dsh://pair?code=...` 与终端二维码。部署可以在 patch 中覆盖 `enabled`、`host`、`port`、`advertiseHost`、`dshHome`、`printPairingCode` 或加密帧上限 `maxPayloadBytes`。如果存在多个局域网地址且默认路由无法消除歧义，启动会给出修正提示并失败；此时必须明确配置 `advertiseHost`。

## 配对与加密

配对信息沿用 Orca 的紧凑自定义 scheme 形式：`code` 查询参数中放置 base64url JSON。内容包括直接 `ws://` 端点、持久主机 id、bearer token 和固定的 Curve25519 主机公钥。token 保存在仅所有者可读的 `$DSH_HOME/mobile/identity.json`，并且绝不会在加密建立前发送。

每次连接都使用新的手机密钥对。手机先以明文 `e2ee_hello` 发送临时 Curve25519 公钥；双方派生共享密钥，主机以明文返回 `e2ee_ready`，手机随后发送加密的 `e2ee_auth`。之后的 JSON 帧均采用 XSalsa20-Poly1305，并编码为 base64(nonce || ciphertext)。认证失败、帧格式错误、输入过大、请求洪泛或出站缓冲过大都会关闭连接。

## 模型体验

无，因为该载体不注册提示词区段或工具 schema。

#### KV Cache 影响

除了用户从手机提交的普通提示词外，没有额外影响。

## 已知限制与后续工作

- 目前仅支持局域网直连；没有 relay、TLS 终止、推送通知或互联网发现。
- 一个持久主机凭据可配对任何扫描当前二维码的手机。当前如需轮换或撤销，必须先停止监听，再删除 `$DSH_HOME/mobile/identity.json`。
- 手机 allowlist 支持已有根 Session 的列表、分页历史、归档 id 读取、模型目录与选择，以及包含文字和 PNG、JPEG、WebP 或 GIF 图片的排队提示。手机应用把一条提示中的图片字节限制为 5 MiB，使加密请求保持在默认 16 MiB 载体帧上限内。它不创建会话、不回答审批或问题、不取消轮次、不上传通用文档，也不暴露子智能体会话。
