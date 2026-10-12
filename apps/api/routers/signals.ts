import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "../lib/trpc.js";
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
