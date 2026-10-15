import { studioState } from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure, router } from "../lib/trpc.js";
import {
  parseWorkerDrafts,
  workerDraftInput,
  workerDraftPrompt,
} from "../services/worker-drafts.js";

const document = z.object({ version: z.literal(1) }).catchall(z.unknown());

export const studioRouter = router({
  generateWorker: protectedProcedure
    .input(workerDraftInput)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.env.AI)
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "AI 写作服务尚未配置。",
        });
      let response: unknown;
      try {
        response = await ctx.env.AI.run("@cf/meta/llama-3.1-8b-instruct-fp8", {
          messages: [
            {
              role: "system",
              content:
                "你是中文社交媒体写作助手。遵守用户要求，输出有效 JSON。",
            },
            { role: "user", content: workerDraftPrompt(input) },
          ],
          max_tokens: 1200,
          temperature: 0.7,
        });
      } catch {
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message: "AI 生成失败或额度不足，请稍后重试。",
        });
      }
      try {
        return { drafts: parseWorkerDrafts(response, input.count) };
      } catch (error) {
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message:
            error instanceof Error ? error.message : "AI 返回的草稿无效。",
        });
      }
    }),
  read: protectedProcedure.query(async ({ ctx }) => {
    const [row] = await ctx.db
      .select({ data: studioState.data, revision: studioState.revision })
      .from(studioState)
      .where(eq(studioState.userId, ctx.user.id));
    return row ?? null;
  }),
  save: protectedProcedure
    .input(
      z.object({
        expectedRevision: z.number().int().min(0),
        data: document,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (JSON.stringify(input.data).length > 500_000)
        throw new TRPCError({
          code: "PAYLOAD_TOO_LARGE",
          message: "Studio data exceeds the 500 KB sync limit.",
        });
      if (input.expectedRevision === 0) {
        const [created] = await ctx.db
          .insert(studioState)
          .values({ userId: ctx.user.id, data: input.data, revision: 1 })
          .onConflictDoNothing()
          .returning({ revision: studioState.revision });
        if (created) return created;
      } else {
        const [saved] = await ctx.db
          .update(studioState)
          .set({
            data: input.data,
            revision: input.expectedRevision + 1,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(studioState.userId, ctx.user.id),
              eq(studioState.revision, input.expectedRevision),
            ),
          )
          .returning({ revision: studioState.revision });
        if (saved) return saved;
      }
      throw new TRPCError({
        code: "CONFLICT",
        message: "Studio data changed on another device. Reload and retry.",
      });
    }),
});
