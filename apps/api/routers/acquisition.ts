import { acquisition, generateId } from "@repo/db";
import { TRPCError } from "@trpc/server";
import { eq, isNull, lte, or } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure, router } from "../lib/trpc.js";
import { nextDailyRun, runAcquisition } from "../services/acquisition.js";
const settings = z.object({
  product: z.string().trim().min(1).max(2000),
  agent: z.object({
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
  enabled: z.boolean(),
  dailyLimit: z.union([z.literal(30), z.literal(60), z.literal(100)]),
});
export const acquisitionRouter = router({
  state: protectedProcedure.query(
    async ({ ctx }) =>
      (await ctx.db.query.acquisition.findFirst({
        where: eq(acquisition.userId, ctx.user.id),
      })) ?? null,
  ),
  save: protectedProcedure.input(settings).mutation(async ({ ctx, input }) => {
    const existing = await ctx.db.query.acquisition.findFirst({
      where: eq(acquisition.userId, ctx.user.id),
    });
    if (existing?.leaseUntil && existing.leaseUntil > new Date())
      throw new TRPCError({
        code: "CONFLICT",
        message: "运行中不能修改配置。",
      });
    const saved = await ctx.db
      .insert(acquisition)
      .values({
        ...input,
        id: generateId("acq"),
        userId: ctx.user.id,
        nextRunAt: nextDailyRun(),
      })
      .onConflictDoUpdate({
        target: acquisition.userId,
        set: { ...input, nextRunAt: nextDailyRun() },
        setWhere: or(
          isNull(acquisition.leaseUntil),
          lte(acquisition.leaseUntil, new Date()),
        ),
      })
      .returning();
    if (!saved.length)
      throw new TRPCError({
        code: "CONFLICT",
        message: "运行中不能修改配置。",
      });
    return { saved: true };
  }),
  run: protectedProcedure.mutation(async ({ ctx }) => {
    if (!ctx.auth) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    try {
      return await runAcquisition(
        ctx.db,
        ctx.auth,
        ctx.env,
        ctx.user.id,
        "manual",
      );
    } catch (error) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: error instanceof Error ? error.message : "发现失败",
      });
    }
  }),
  review: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        review: z.enum(["new", "follow_up", "not_fit", "contacted"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Serialize JSON review writes with discovery completion and other reviewers.
      await ctx.db.transaction(async (db) => {
        const [row] = await db
          .select()
          .from(acquisition)
          .where(eq(acquisition.userId, ctx.user.id))
          .for("update");
        if (!row || !row.leads.some((lead) => lead.id === input.id))
          throw new TRPCError({ code: "NOT_FOUND" });
        await db
          .update(acquisition)
          .set({
            leads: row.leads.map((lead) =>
              lead.id === input.id ? { ...lead, review: input.review } : lead,
            ),
          })
          .where(eq(acquisition.id, row.id));
      });
      return { saved: true };
    }),
});
