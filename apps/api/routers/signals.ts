import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "../lib/trpc.js";
import { inspirationSearchUrl } from "../services/inspiration-search.js";
import { fetchXAnalytics, fetchXTimeline } from "../services/x-analytics.js";
import { discoverXLeads, XDataError } from "../services/x-data.js";
import {
  disconnectX,
  userXToken,
  xOAuthConnection,
} from "../services/x-oauth.js";

export const signalsRouter = router({
  connection: protectedProcedure.query(({ ctx }) =>
    xOAuthConnection(ctx, ctx.user.id),
  ),
  disconnect: protectedProcedure.mutation(({ ctx }) =>
    disconnectX(ctx, ctx.user.id),
  ),
  recentOwnPosts: protectedProcedure.mutation(async ({ ctx }) => {
    const connection = await xOAuthConnection(ctx, ctx.user.id);
    if (!connection.xAccountId)
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "请先连接 X。",
      });
    const token = await userXToken(ctx, ctx.user.id);
    let response: Response;
    try {
      response = await fetch(
        `https://api.x.com/2/users/${connection.xAccountId}/tweets?max_results=30&exclude=retweets,replies`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(20_000),
        },
      );
    } catch {
      throw new TRPCError({
        code: "BAD_GATEWAY",
        message: "读取近期帖子超时，请稍后重试。",
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
        message: `读取近期帖子失败（HTTP ${response.status}）。`,
      });
    const payload: unknown = await response.json();
    const parsed = z
      .object({ data: z.array(z.object({ text: z.string() })).optional() })
      .safeParse(payload);
    if (!parsed.success)
      throw new TRPCError({
        code: "BAD_GATEWAY",
        message: "X 返回的帖子数据不完整。",
      });
    return parsed.data.data?.map((post) => post.text) ?? [];
  }),
  publish: protectedProcedure
    .input(z.object({ text: z.string().trim().min(1).max(280) }))
    .mutation(async ({ ctx, input }) => {
      const connection = await xOAuthConnection(ctx, ctx.user.id);
      if (!connection.canPublish)
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "请重新授权 X，授予 tweet.write 发帖权限。",
        });
      const token = await userXToken(ctx, ctx.user.id);
      let response: Response;
      try {
        response = await fetch("https://api.x.com/2/tweets", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ text: input.text }),
          signal: AbortSignal.timeout(20_000),
        });
      } catch {
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message:
            "X 发帖请求未能完成，请先到 X 账号检查是否已发布，避免重复提交。",
        });
      }
      if (response.status === 402)
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "X API 余额不足。请检查 X Developer Console 的 Credits。",
        });
      if (response.status === 429)
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "X 发帖额度或速率限制已触发，请稍后重试。",
        });
      if (response.status === 401 || response.status === 403)
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "X 发帖授权无效，请重新连接 X。",
        });
      if (!response.ok)
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message: `X 发帖失败（HTTP ${response.status}）。`,
        });
      const payload: unknown = await response.json();
      const parsed = z
        .object({ data: z.object({ id: z.string(), text: z.string() }) })
        .safeParse(payload);
      if (!parsed.success)
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message: "X 已响应，但结果不完整。请到 X 账号核对，避免重复发布。",
        });
      return {
        id: parsed.data.data.id,
        url: `https://x.com/i/status/${parsed.data.data.id}`,
      };
    }),
  analytics: protectedProcedure.mutation(async ({ ctx }) => {
    const connection = await xOAuthConnection(ctx, ctx.user.id);
    if (!connection.xAccountId)
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "请先连接 X。",
      });
    const token = await userXToken(ctx, ctx.user.id);
    const [profilePayload, timeline] = await Promise.all([
      fetchXAnalytics(
        `https://api.x.com/2/users/${encodeURIComponent(connection.xAccountId)}?user.fields=public_metrics`,
        token,
      ),
      fetchXTimeline(connection.xAccountId, token),
    ]);
    const profile = z
      .object({
        data: z.object({
          public_metrics: z.object({ followers_count: z.number() }),
        }),
      })
      .safeParse(profilePayload);
    if (!profile.success)
      throw new TRPCError({
        code: "BAD_GATEWAY",
        message: "X 返回的统计数据不完整。",
      });
    return {
      followers: profile.data.data.public_metrics.followers_count,
      ...timeline,
    };
  }),
  analyticsPage: protectedProcedure
    .input(z.object({ paginationToken: z.string().min(1).max(512) }))
    .mutation(async ({ ctx, input }) => {
      const connection = await xOAuthConnection(ctx, ctx.user.id);
      if (!connection.xAccountId)
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "请先连接 X。",
        });
      const token = await userXToken(ctx, ctx.user.id);
      return fetchXTimeline(
        connection.xAccountId,
        token,
        input.paginationToken,
      );
    }),
  searchPosts: protectedProcedure
    .input(
      z.object({
        query: z.string().trim().min(1).max(256),
        mediaOnly: z.boolean().default(false),
        period: z.enum(["day", "week"]).default("week"),
        paginationToken: z.string().min(1).max(512).optional(),
        searchAt: z.coerce.date().optional(),
        account: z
          .string()
          .trim()
          .regex(/^@?[A-Za-z0-9_]{1,15}$/)
          .transform((value) => value.replace(/^@/, ""))
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const token = await userXToken(ctx, ctx.user.id);
      const url = inspirationSearchUrl({
        ...input,
        now: input.searchAt ?? new Date(),
      });
      let response: Response;
      try {
        response = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(20_000),
        });
      } catch {
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message: "X 搜索请求超时，请稍后重试。",
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
          message: "X 搜索已限流，请稍后重试。",
        });
      if (!response.ok)
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message: `X 搜索失败（HTTP ${response.status}）。`,
        });
      const parsed = z
        .object({
          data: z
            .array(
              z.object({
                id: z.string(),
                text: z.string(),
                author_id: z.string(),
                created_at: z.string().optional(),
                attachments: z
                  .object({ media_keys: z.array(z.string()).optional() })
                  .optional(),
                public_metrics: z
                  .object({
                    like_count: z.number().optional(),
                    reply_count: z.number().optional(),
                    repost_count: z.number().optional(),
                  })
                  .optional(),
              }),
            )
            .optional(),
          includes: z
            .object({
              users: z
                .array(
                  z.object({
                    id: z.string(),
                    name: z.string(),
                    username: z.string(),
                  }),
                )
                .optional(),
              media: z
                .array(
                  z.object({
                    media_key: z.string(),
                    type: z.string(),
                    url: z.string().optional(),
                    preview_image_url: z.string().optional(),
                  }),
                )
                .optional(),
            })
            .optional(),
          meta: z.object({ next_token: z.string().optional() }).optional(),
        })
        .safeParse(await response.json());
      if (!parsed.success)
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message: "X 搜索结果不完整。",
        });
      const users = new Map(
        (parsed.data.includes?.users ?? []).map((item) => [item.id, item]),
      );
      const media = new Map(
        (parsed.data.includes?.media ?? []).map((item) => [
          item.media_key,
          item,
        ]),
      );
      return {
        nextToken: parsed.data.meta?.next_token ?? null,
        posts: (parsed.data.data ?? []).map((post) => ({
          id: post.id,
          text: post.text,
          createdAt: post.created_at ?? null,
          author: users.get(post.author_id) ?? {
            id: post.author_id,
            name: "Unknown",
            username: "",
          },
          likes: post.public_metrics?.like_count ?? 0,
          replies: post.public_metrics?.reply_count ?? 0,
          reposts: post.public_metrics?.repost_count ?? 0,
          media: (post.attachments?.media_keys ?? [])
            .map((key) => media.get(key))
            .filter((item) => item !== undefined),
        })),
      };
    }),
  discover: protectedProcedure
    .input(
      z.object({
        id: z.string().min(1).max(100),
        name: z.string().trim().min(1).max(60),
        icpDescription: z.string().trim().min(1).max(4000),
        precisionMode: z.enum(["standard", "high"]),
        signals: z
          .array(
            z.object({
              type: z.enum(["keyword", "profile_watch", "list_watch"]),
              value: z.string().trim().min(1).max(256),
            }),
          )
          .min(1)
          .max(3),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const connection = await xOAuthConnection(ctx, ctx.user.id);
      const token = await userXToken(ctx, ctx.user.id);
      try {
        return await discoverXLeads(input, token, connection.maxPostsPerRun);
      } catch (error) {
        if (error instanceof XDataError)
          throw new TRPCError({
            code:
              error.kind === "rate_limit"
                ? "TOO_MANY_REQUESTS"
                : error.kind === "billing"
                  ? "PRECONDITION_FAILED"
                  : error.kind === "configuration"
                    ? "BAD_REQUEST"
                    : "BAD_GATEWAY",
            message: error.message,
          });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "真实线索发现失败，请稍后重试。",
        });
      }
    }),
});
