import {
  discover,
  normalizeSignals,
  type AgentInput,
  type Lead,
  type Person,
  type SignalInput,
} from "@repo/core/signals";
import { z } from "zod";

const userSchema = z.object({
  id: z.string(),
  username: z.string(),
  name: z.string(),
  description: z.string().optional(),
  public_metrics: z
    .object({ followers_count: z.number().optional() })
    .optional(),
});
const postSchema = z.object({
  id: z.string(),
  text: z.string(),
  author_id: z.string(),
  created_at: z.string().optional(),
});
const responseSchema = z.object({
  data: z.array(postSchema).optional(),
  includes: z.object({ users: z.array(userSchema).optional() }).optional(),
  errors: z.array(z.unknown()).optional(),
  meta: z.object({ result_count: z.number() }).optional(),
});

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
export class XDataError extends Error {
  constructor(
    public readonly kind:
      | "configuration"
      | "billing"
      | "rate_limit"
      | "upstream",
    message: string,
  ) {
    super(message);
  }
}

function listId(value: string): string {
  const match = value
    .trim()
    .match(/^(?:https:\/\/(?:x\.com|twitter\.com)\/i\/lists\/)?(\d+)\/?$/);
  if (!match)
    throw new XDataError(
      "configuration",
      "真实列表监测需要公开 X 列表的数字 ID 或 x.com/i/lists/... 链接。",
    );
  return match[1];
}

async function request(
  path: string,
  params: Record<string, string>,
  token: string,
  fetcher: Fetcher,
): Promise<unknown> {
  const url = new URL(path, "https://api.x.com");
  for (const [key, value] of Object.entries(params))
    url.searchParams.set(key, value);
  let response: Response;
  try {
    response = await fetcher(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new XDataError("upstream", "X 请求超时或网络不可用，请稍后重试。");
  }
  if (response.status === 402)
    throw new XDataError(
      "billing",
      "X API 返回 402（需要付款）。请在 X Developer Console 的 Credits 页面检查余额、付费状态和支出上限；重新 OAuth 授权无法解决此计费错误。",
    );
  if (response.status === 429)
    throw new XDataError(
      "rate_limit",
      "X 接口限流或额度不足。请检查开发者控制台后再运行。",
    );
  if (response.status === 401 || response.status === 403)
    throw new XDataError("configuration", "X 凭证无效或没有此接口的访问权限。");
  if (!response.ok)
    throw new XDataError(
      "upstream",
      `X 数据请求失败（HTTP ${response.status}）。`,
    );
  try {
    return await response.json();
  } catch {
    throw new XDataError("upstream", "X 返回了无法解析的数据。");
  }
}

export async function fetchXPeople(
  signals: SignalInput[],
  token: string,
  maxPosts = 30,
  fetcher: Fetcher = fetch,
): Promise<{ people: Person[]; postsScanned: number }> {
  if (!token.trim())
    throw new XDataError("configuration", "后端尚未配置 X_BEARER_TOKEN。");
  if (signals.length < 1 || signals.length > 3)
    throw new XDataError("configuration", "每次真实发现需要 1–3 个监测信号。");
  const normalized = normalizeSignals(signals);
  if (!normalized.length)
    throw new XDataError("configuration", "请添加非空监测信号。");
  for (const signal of normalized) {
    if (signal.type === "list_watch") listId(signal.value);
    if (
      signal.type === "profile_watch" &&
      !/^[a-zA-Z0-9_]{1,15}$/.test(signal.value.replace(/^@/, ""))
    )
      throw new XDataError(
        "configuration",
        "账号应为有效的 X 用户名，不包含网址。",
      );
  }
  const limit = Math.min(100, Math.max(30, maxPosts));
  const perSignal = Math.floor(limit / normalized.length);
  const people = new Map<string, Person>();
  const postIds = new Set<string>();

  for (const signal of normalized) {
    let path: string;
    const params: Record<string, string> = {
      max_results: String(perSignal),
      expansions: "author_id",
      "tweet.fields": "author_id,created_at",
      "user.fields": "description,public_metrics",
    };
    if (signal.type === "keyword") {
      path = "/2/tweets/search/recent";
      params.query = signal.value;
    } else if (signal.type === "profile_watch") {
      const handle = signal.value.replace(/^@/, "");
      const resolved = z
        .object({ data: userSchema })
        .safeParse(
          await request(
            `/2/users/by/username/${handle}`,
            { "user.fields": "description,public_metrics" },
            token,
            fetcher,
          ),
        );
      if (!resolved.success)
        throw new XDataError("upstream", "无法解析 X 账号资料。");
      path = `/2/users/${resolved.data.data.id}/tweets`;
    } else {
      path = `/2/lists/${listId(signal.value)}/tweets`;
    }
    const parsed = responseSchema.safeParse(
      await request(path, params, token, fetcher),
    );
    if (
      !parsed.success ||
      parsed.data.errors?.length ||
      (!parsed.data.data && parsed.data.meta?.result_count !== 0)
    )
      throw new XDataError(
        "upstream",
        "X 返回不完整的数据，本次发现未保存。部分读取可能已计费。",
      );
    const users = new Map(
      (parsed.data.includes?.users ?? []).map((user) => [user.id, user]),
    );
    for (const post of (parsed.data.data ?? []).slice(0, perSignal)) {
      const user = users.get(post.author_id);
      if (!user)
        throw new XDataError(
          "upstream",
          "X 返回的作者资料不完整，本次发现未保存。",
        );
      postIds.add(post.id);
      const person = people.get(user.id) ?? {
        id: user.id,
        username: user.username,
        displayName: user.name,
        bio: user.description ?? "",
        followers: user.public_metrics?.followers_count ?? 0,
        posts: [],
        interactions: [],
        lists: [],
        postEvidence: [],
        observedSignals: [],
      };
      if (!person.postEvidence?.some((item) => item.id === post.id)) {
        person.posts.push(post.text);
        person.postEvidence?.push({
          id: post.id,
          text: post.text,
          postedAt: post.created_at,
        });
      }
      if (signal.type === "list_watch" && !person.lists.includes(signal.value))
        person.lists.push(signal.value);
      person.observedSignals?.push({
        type: signal.type,
        value: signal.value,
        postText: post.text,
      });
      people.set(user.id, person);
    }
  }
  return { people: [...people.values()], postsScanned: postIds.size };
}

export async function discoverXLeads(
  input: AgentInput & { id: string },
  token: string,
  maxPosts = 30,
  fetcher: Fetcher = fetch,
): Promise<{
  leads: Lead[];
  postsScanned: number;
  candidatesScored: number;
  checkedAt: string;
}> {
  const now = new Date().toISOString();
  const { people, postsScanned } = await fetchXPeople(
    input.signals,
    token,
    maxPosts,
    fetcher,
  );
  const result = discover(
    {
      ...input,
      signals: normalizeSignals(input.signals),
      status: "active",
      createdAt: now,
      updatedAt: now,
      lastCheckedAt: null,
    },
    [],
    people,
    now,
  );
  const leads = result.leads.map((lead) => {
    const evidence =
      lead.person.postEvidence?.find(
        (post) => post.text === lead.provenance.source,
      ) ?? lead.person.postEvidence?.[0];
    return {
      ...lead,
      dataSource: "x" as const,
      provenance: {
        ...lead.provenance,
        postId: evidence?.id,
        postedAt: evidence?.postedAt,
        postUrl: evidence
          ? `https://x.com/${lead.person.username}/status/${evidence.id}`
          : undefined,
      },
    };
  });
  return {
    leads,
    postsScanned,
    candidatesScored: people.length,
    checkedAt: now,
  };
}
