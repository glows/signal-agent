import { studioState } from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure, router } from "../lib/trpc.js";

const document = z.object({ version: z.literal(1) }).catchall(z.unknown());

export const studioRouter = router({
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
