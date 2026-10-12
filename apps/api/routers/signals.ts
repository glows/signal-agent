import { TRPCError } from "@trpc/server";
import { z } from "zod";

import type { Env } from "../lib/env.js";
import { protectedProcedure, router } from "../lib/trpc.js";
import { discoverXLeads, XDataError } from "../services/x-data.js";

export function xConnection(
  env: Pick<
    Env,
    "X_BEARER_TOKEN" | "X_ALLOWED_USER_IDS" | "X_MAX_POSTS_PER_RUN"
  >,
  userId: string,
) {
  const configured = Boolean(env.X_BEARER_TOKEN?.trim());
  const allowed = (env.X_ALLOWED_USER_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .includes(userId);
  const requested = Number(env.X_MAX_POSTS_PER_RUN ?? 30);
  const maxPostsPerRun = Number.isFinite(requested)
    ? Math.min(100, Math.max(30, Math.floor(requested)))
    : 30;
  return { configured, allowed, userId, maxPostsPerRun };
}

export const signalsRouter = router({
  connection: protectedProcedure.query(({ ctx }) =>
    xConnection(ctx.env, ctx.user.id),
  ),
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
      const connection = xConnection(ctx.env, ctx.user.id);
      if (!connection.allowed)
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "此账号尚未获准使用真实 X 数据，请配置后端 X_ALLOWED_USER_IDS。",
        });
      if (!connection.configured)
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "后端尚未配置 X_BEARER_TOKEN。",
        });
      try {
        return await discoverXLeads(
          input,
          ctx.env.X_BEARER_TOKEN!,
          connection.maxPostsPerRun,
        );
      } catch (error) {
        if (error instanceof XDataError)
          throw new TRPCError({
            code:
              error.kind === "rate_limit"
                ? "TOO_MANY_REQUESTS"
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
