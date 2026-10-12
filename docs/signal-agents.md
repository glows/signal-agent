# Signal Agents

Signal Agents is implemented inside the starter kit rather than as a separate application. The shared matching domain lives in `packages/core/signals`, the SPA feature lives in `apps/app/features/signals`, and authenticated live reads use the `signals` tRPC router in `apps/api`.

## Pages

- `/signal-demo`: public local demo, with fictional sample people and posts.
- `/signals`: authenticated workspace, reachable from the starter kit sidebar. Switch between demonstration and real X data at the top of the page.

Both modes support Agent creation/editing, pause/resume/delete, one-shot discovery, scoring, provenance, lead filters, feedback, and local persistence. Real and demo datasets use separate storage keys. Real data keys also include the starter kit user ID. This version saves Agents and leads in the browser, so they are not synchronized between devices and clearing site data removes them. Pausing an Agent disables its manual run; no background scheduler is enabled.

## Enable real X data

1. Configure the starter kit authentication/database/email services using its existing setup guide, then sign in at `/signals`.
2. Create an X developer application with access to the read endpoints and a funded API account. Use its app-only Bearer token; no token belongs in a `VITE_*` variable or in browser storage.
3. Put these values in the repository's ignored `.env.local` file:

```dotenv
X_BEARER_TOKEN=YOUR_X_APP_BEARER_TOKEN
X_ALLOWED_USER_IDS=YOUR_STARTER_KIT_USER_ID
X_MAX_POSTS_PER_RUN=30
```

The real-mode connection panel displays your starter kit user ID. Add additional authorized IDs as comma-separated values. The default is denied for every user until explicitly allowlisted, even when a token exists. The API never returns the Bearer token to the SPA. For Cloudflare deployment, provision the token as a secret and the other values as environment configuration.

4. Restart the API server, open `/signals`, choose **真实 X 数据**, and click **重新检查连接**.
5. Create an Agent and run it. Reads consume X API credits; set a spending limit in the X developer console before testing. This application bounds each run to 30 posts by default, configurable from 30 to 100, across at most three signals. It does not maintain a monthly spending counter. Resolving profile handles and expanded user resources can also incur charges.

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
bunx vitest run apps/api/services/x-data.test.ts apps/api/services/discovery.test.ts apps/api/services/agents.test.ts apps/api/routers/signals.test.ts apps/app/features/signals/storage.test.ts apps/app/features/signals/workspace.test.tsx
bun run app:build
bun run email:build
bun run typecheck
```

Connector and UI tests use fixture X responses and do not incur API charges. A successful live X smoke test requires a real configured token and an allowlisted signed-in user.

Sources: [X search](https://docs.x.com/x-api/posts/search/introduction), [X pricing](https://docs.x.com/x-api/getting-started/pricing), [SuperX signal agents](https://docs.superx.so/api-reference/signals/list-signal-agents).
