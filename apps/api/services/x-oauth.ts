import { identity } from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";

import type { TRPCContext } from "../lib/context.js";

export const X_READ_SCOPES = [
  "tweet.read",
  "users.read",
  "list.read",
  "offline.access",
];

export async function findXAccount(ctx: TRPCContext, userId: string) {
  return ctx.db.query.identity.findFirst({
    where: and(eq(identity.userId, userId), eq(identity.providerId, "twitter")),
  });
}

export async function xOAuthConnection(ctx: TRPCContext, userId: string) {
  const account = await findXAccount(ctx, userId);
  const scopes = (account?.scope ?? "").split(/[ ,]+/).filter(Boolean);
  const missingScopes = X_READ_SCOPES.filter(
    (scope) => !scopes.includes(scope),
  );
  const configured = Boolean(
    ctx.env.TWITTER_CLIENT_ID && ctx.env.TWITTER_CLIENT_SECRET,
  );
  const requested = Number(ctx.env.X_MAX_POSTS_PER_RUN ?? 30);
  return {
    configured,
    allowed:
      configured &&
      Boolean(account?.accessToken && account.refreshToken) &&
      missingScopes.length === 0,
    connected: Boolean(account),
    userId,
    xAccountId: account?.accountId ?? null,
    missingScopes,
    maxPostsPerRun: Number.isFinite(requested)
      ? Math.min(100, Math.max(30, Math.floor(requested)))
      : 30,
  };
}

export async function userXToken(ctx: TRPCContext, userId: string) {
  const connection = await xOAuthConnection(ctx, userId);
  if (!connection.allowed)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "请先连接或重新授权 X，授予帖子、用户、列表读取和持续访问权限。",
    });
  const account = await findXAccount(ctx, userId);
  if (!account || !ctx.auth)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "授权服务不可用。",
    });
  try {
    const result = await ctx.auth.api.getAccessToken({
      headers: ctx.req.headers,
      body: { accountId: account.id },
    });
    if (
      !result.accessToken ||
      (result.accessTokenExpiresAt &&
        result.accessTokenExpiresAt.getTime() <= Date.now())
    )
      throw new Error("expired");
    return result.accessToken;
  } catch {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "X 授权已失效或刷新失败，请重新连接 X。",
    });
  }
}

export async function disconnectX(ctx: TRPCContext, userId: string) {
  const account = await findXAccount(ctx, userId);
  if (!account) return { disconnected: true, revoked: true };
  if (!ctx.auth)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "授权服务不可用。",
    });
  let token: string | undefined;
  try {
    token = (
      await ctx.auth.api.getAccessToken({
        headers: ctx.req.headers,
        body: { accountId: account.id },
      })
    ).accessToken;
  } catch {
    /* An expired grant can still be removed locally. */
  }
  try {
    await ctx.auth.api.unlinkAccount({
      headers: ctx.req.headers,
      body: { accountId: account.id },
    });
  } catch {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "无法断开连接。如果 X 是唯一登录方式，请先在账户设置中添加其他登录方式。",
    });
  }
  let revoked = false;
  if (token && ctx.env.TWITTER_CLIENT_ID && ctx.env.TWITTER_CLIENT_SECRET) {
    try {
      const response = await fetch("https://api.x.com/2/oauth2/revoke", {
        method: "POST",
        signal: AbortSignal.timeout(10000),
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${btoa(`${ctx.env.TWITTER_CLIENT_ID}:${ctx.env.TWITTER_CLIENT_SECRET}`)}`,
        },
        body: new URLSearchParams({
          token,
          client_id: ctx.env.TWITTER_CLIENT_ID,
        }),
      });
      revoked = response.ok;
    } catch {
      revoked = false;
    }
  }
  return { disconnected: true, revoked };
}
