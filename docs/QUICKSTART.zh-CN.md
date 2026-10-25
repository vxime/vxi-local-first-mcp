# 本地优先 MCP：快速开始

- Node.js >=22，无第三方 npm 依赖。
- `npm test`：执行合成离线负向测试。
- `npm run demo`：展示只含数量和状态枚举的安全投影。
- `node bin/vxi-local.mjs status --workspace /本地项目路径`：仅读取文件类型计数，不读取源码内容。
- `node bin/vxi-local.mjs mcp --workspace /本地项目路径`：启动只读 stdio MCP 服务。

网页端连接可参考 OpenAI 官方 Secure MCP Tunnel（需要自行具备组织权限、创建隧道、完成实际连通验收）。不可将 stdio 端口直接映射到公网。

**重要：** 本地安装的云端模型客户端仍可能发送源码到模型提供方。本方案不自动接管 Codex 桌面，也不声称源码不出设备的端到端保证。严格本地商业项目应使用本地推理或确定性执行，把网页端限制在脱敏的状态评估。
