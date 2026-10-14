# Signal Agents

Signal Agents is implemented inside the starter kit rather than as a separate application. The shared matching domain lives in `packages/core/signals`, the SPA feature lives in `apps/app/features/signals`, and authenticated live reads use the `signals` tRPC router in `apps/api`.

## Pages

- `/signal-demo`: public local demo, with fictional sample people and posts.
- `/signals`: authenticated workspace, reachable from the starter kit sidebar. Switch between demonstration and real X data at the top of the page.

Both modes support Agent creation/editing, pause/resume/delete, one-shot discovery, scoring, provenance, lead filters, feedback, and local persistence. Real and demo datasets use separate storage keys. Real data keys also include the starter kit user ID. This version saves Agents and leads in the browser, so they are not synchronized between devices and clearing site data removes them. Pausing an Agent disables its manual run; no background scheduler is enabled.

## Enable X OAuth 2.0

The application now uses each signed-in user's X OAuth grant. Shared app-only Bearer tokens and the former user allowlist are not used by Signal Agents.

1. In the X developer console, enable OAuth 2.0 for a **Web App** (confidential client). Configure this exact local callback URL:

```text
http://127.0.0.1:5174/api/auth/callback/twitter
```

2. Fill the ignored repository `.env.local` file:

```dotenv
APP_ORIGIN=http://127.0.0.1:5174
TWITTER_CLIENT_ID=YOUR_OAUTH_CLIENT_ID
TWITTER_CLIENT_SECRET=YOUR_OAUTH_CLIENT_SECRET
X_MAX_POSTS_PER_RUN=30
```

Use OAuth Client ID and Client Secret, not the API Key/Secret or an app-only Bearer token. In production, use the deployed application's origin for both APP_ORIGIN and the matching callback, and provision secrets on the API Worker. No credentials belong in VITE variables.

3. Configure and initialize the starter kit's PostgreSQL database, then restart the API server and SPA. No additional table migration is introduced by this feature: Better Auth's existing identity table stores the grant.
4. Sign in with **Continue with X**, or sign in with another method and select **连接 X** at `/signals`. The latter links an X grant to the signed-in project user. Confirm the requested permissions at X. New authenticated workspaces open in real mode.
5. Once the page shows **真实 X 数据已就绪**, create an Agent and run discovery.

Better Auth handles state validation, PKCE and the authorization callback. Its Twitter provider requests tweet.read, users.read, offline.access and users.email (for login); this app adds list.read. Tokens are encrypted in the identity table using BETTER_AUTH_SECRET. Keep that secret stable: replacing it invalidates encrypted provider credentials. Existing plaintext OAuth accounts from an older deployment need a migration or fresh authorization before enabling token encryption.

Before each real discovery the API selects only the current user's Twitter identity, then asks Better Auth for a valid token. Expired tokens are refreshed and rotated refresh tokens are encrypted and persisted. A failed refresh requires reconnection. API responses never include the provider token. Connection status is read from the fresh database; it reports missing scopes rather than pretending an incomplete grant is ready.

Use **重新授权 X** to renew an existing grant. **断开 X 连接** removes the linked identity and attempts X-side token revocation; if remote revocation fails, the UI asks you to confirm removal in X settings. Better Auth blocks unlinking the only login identity, so add another working login method first when X is your sole provider. Previously saved lead records remain local.

API reads still consume X credits. Set a developer-console spending limit before testing. Each manual run reads up to 30 posts by default (configurable from 30 to 100) across at most three signals. Expanded user resources and account lookup may incur additional charges. No monthly application spending counter or background scheduler is enabled.

## Supported live sources

| Signal | Input | X API |
| --- | --- | --- |
| Keyword | Keyword or supported X search query | `GET /2/tweets/search/recent` |
| Profile | Username, with or without `@` | Username lookup, then `GET /2/users/{id}/tweets` |
| Public list | Numeric list ID or `https://x.com/i/lists/ID` | `GET /2/lists/{id}/tweets` |

Each run fetches one bounded page per source. Public list monitoring discovers authors of the returned list posts; it does not enumerate every list member. Protected content, direct messages, publishing, and follower monitoring are not implemented. Access depends on the X application permissions, credit balance, and endpoint rate limits.

The connector keeps original post IDs, URLs, dates, and the source query. Server-confirmed X query matches are preserved, so operators such as `OR` are not mistakenly treated as literal words by local matching. Authors and post IDs are deduplicated. Re-running does not duplicate saved leads or replace human feedback.

The current score is a deterministic rule score based on profile/post overlap, matched signals, and demand language. It is not SuperX's private score and does not call an LLM. Standard mode keeps scores of at least 45; high precision keeps at least 80. Errors, missing access, rate limits, and incomplete upstream responses are shown as failures rather than fabricated results.

## Verification

```sh
bunx vitest run apps/api/services/x-data.test.ts apps/api/services/x-oauth.test.ts apps/api/services/discovery.test.ts apps/api/services/agents.test.ts apps/api/routers/signals.test.ts apps/app/features/signals/storage.test.ts apps/app/features/signals/workspace.test.tsx
bun run app:build
bun run email:build
bun run typecheck
```

Connector and UI tests use fixture X responses and do not incur API charges. A successful live X smoke test requires real OAuth client credentials, a working local database, and a completed user authorization.

Sources: [X search](https://docs.x.com/x-api/posts/search/introduction), [X pricing](https://docs.x.com/x-api/getting-started/pricing), [SuperX signal agents](https://docs.superx.so/api-reference/signals/list-signal-agents).

## 每日获客简报

登录后打开 `/brief`，配置产品、理想客户、监测来源与每日读取预算。保存后可手动运行，并开启每天北京时间 09:00 的自动发现。线索及审核状态保存到 PostgreSQL。

本地 API 保持在线时每分钟扫描到期配置。生产使用 API Worker 的 Cron Triggers，部署后每 5 分钟扫描到期配置；本次开发没有部署生产环境。402 或权限配置错误会暂停自动发现，修复后需在配置中重新开启。

预算限制帖子读取数量，不是货币费用上限；失败请求也预留预算。第一版每账号一个配置，最多保留 1000 条线索及 60 次运行。现有浏览器本地的 Agent 不会自动迁移到每日配置。

## 回复草稿

每日简报的线索卡片提供“准备回复草稿”。可选择专业、友好或简洁语气，补充自己的想法，生成后编辑并保存。第一版是基于来源文本和人工输入的模板生成，不调用大模型，也不申请 X 写入权限。

草稿保存在该用户的线索 JSON 中，无需新的数据库迁移。生成不会自动保存，保存不会发布或把线索标记为已联系。重新生成已有文字前需明确确认替换。审核后可复制文字并前往 X 原帖手动发布。
