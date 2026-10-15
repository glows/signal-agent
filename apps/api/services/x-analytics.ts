import { TRPCError } from "@trpc/server";
import { z } from "zod";

const timelineSchema = z.object({
  data: z
    .array(
      z.object({
        id: z.string(),
        text: z.string(),
        created_at: z.string().optional(),
        referenced_tweets: z.array(z.object({ type: z.string() })).optional(),
        public_metrics: z
          .object({
            like_count: z.number().default(0),
            reply_count: z.number().default(0),
            repost_count: z.number().default(0),
            impression_count: z.number().optional(),
          })
          .optional(),
      }),
    )
    .optional(),
  meta: z.object({ next_token: z.string().optional() }).optional(),
});

export async function fetchXAnalytics(
  endpoint: string,
  token: string,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new TRPCError({
      code: "BAD_GATEWAY",
      message: "X 统计请求超时，请稍后重试。",
    });
  }
  if (response.status === 402)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "X API 余额不足，请检查 Developer Console。",
    });
  if (response.status === 429)
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "X API 已限流，请稍后重试。",
    });
  if (!response.ok)
    throw new TRPCError({
      code: "BAD_GATEWAY",
      message: `X 统计请求失败（HTTP ${response.status}）。`,
    });
  return response.json();
}

export async function fetchXTimeline(
  accountId: string,
  token: string,
  paginationToken?: string,
) {
  const url = new URL(
    `https://api.x.com/2/users/${encodeURIComponent(accountId)}/tweets`,
  );
  url.searchParams.set("max_results", "30");
  url.searchParams.set(
    "tweet.fields",
    "created_at,public_metrics,referenced_tweets",
  );
  if (paginationToken)
    url.searchParams.set("pagination_token", paginationToken);
  const parsed = timelineSchema.safeParse(
    await fetchXAnalytics(url.toString(), token),
  );
  if (!parsed.success)
    throw new TRPCError({
      code: "BAD_GATEWAY",
      message: "X 返回的统计数据不完整。",
    });
  return {
    nextToken: parsed.data.meta?.next_token ?? null,
    posts: (parsed.data.data ?? []).map((post) => ({
      id: post.id,
      text: post.text,
      createdAt: post.created_at ?? null,
      kind: post.referenced_tweets?.some((ref) => ref.type === "replied_to")
        ? ("reply" as const)
        : post.referenced_tweets?.some((ref) => ref.type === "retweeted")
          ? ("repost" as const)
          : post.referenced_tweets?.some((ref) => ref.type === "quoted")
            ? ("quote" as const)
            : ("post" as const),
      likes: post.public_metrics?.like_count ?? 0,
      replies: post.public_metrics?.reply_count ?? 0,
      reposts: post.public_metrics?.repost_count ?? 0,
      impressions: post.public_metrics?.impression_count ?? null,
    })),
  };
}
