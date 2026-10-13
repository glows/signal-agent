# Signal Agent

发现需求，让联系有依据。

Signal Agent 根据关键词、X 账号和列表发现潜在线索，展示匹配理由与来源帖子，并在当前浏览器保存线索和反馈。

## 功能

- 无需登录的虚构数据演示。
- 通过 Better Auth 和 X OAuth 2.0 连接真实 X 数据。
- 手动运行发现，规则评分，保留原始帖子来源。
- 默认工具工作台和可切换的自然浅绿主题。
- PostgreSQL 保存账号、会话和加密的 OAuth 令牌。

真实数据读取需要 X API 可用额度。当前不提供持续后台监测、自动私信或跨设备线索同步。

## 本地开发

```sh
bun install
bun dev
```

也可分别运行 `bun web:dev`、`bun app:dev`、`bun api:dev`。营销站点默认使用 4321 端口，App 使用 Vite 分配的端口，API 使用 8787 端口。

配置与数据连接见 [Signal Agent 文档](docs/signal-agents.md)。本地凭证放在被 Git 忽略的 `.env.local` 中。

## 项目结构

- `apps/web`：Astro landing page 与边缘路由。
- `apps/app`：React 工作台。
- `apps/api`：Hono、tRPC、Better Auth 与 X 数据连接。
- `packages/core/signals`：Agent、线索和规则评分。
- `db`：Drizzle 与 PostgreSQL 数据模型。

## 来源与许可

本项目基于 [Kriasoft React Starter Kit](https://github.com/kriasoft/react-starter-kit) 构建。保留原始 MIT 许可与版权声明，详见 [LICENSE](LICENSE)。
