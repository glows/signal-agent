import { createInitialData } from "@repo/core/signals";
import { acquisition, user } from "@repo/db";
import { createTestDatabase } from "@repo/db/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, expect, it } from "vitest";

import type { TRPCContext } from "../lib/context";
import { createCallerFactory } from "../lib/trpc";
import { nextDailyRun } from "../services/acquisition";
import { acquisitionRouter } from "./acquisition";
const { db, reset, close } = await createTestDatabase();
beforeEach(reset);
afterAll(close);
async function context(email: string): Promise<TRPCContext> {
  const [person] = await db
    .insert(user)
    .values({ name: "Buyer", email, emailVerified: true })
    .returning();
  return {
    db,
    dbCached: db,
    req: new Request("http://localhost"),
    info: {} as TRPCContext["info"],
    env: {} as TRPCContext["env"],
    user: person,
    session: {
      id: "test-session",
      userId: person.id,
      token: "test",
      expiresAt: new Date(Date.now() + 10000),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };
}
const caller = createCallerFactory(acquisitionRouter);
const config = {
  product: "CRM",
  agent: {
    name: "Daily",
    icpDescription: "SaaS sales",
    precisionMode: "high" as const,
    signals: [{ type: "keyword" as const, value: "need CRM" }],
  },
  enabled: false,
  dailyLimit: 30 as const,
};
it("keeps users' configs and reviews isolated", async () => {
  const a = caller(await context("a@test.com"));
  const b = caller(await context("b@test.com"));
  await a.save(config);
  expect((await a.state())?.product).toBe("CRM");
  expect(await b.state()).toBeNull();
  await expect(
    b.review({ id: "any", review: "contacted" }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await b.save({ ...config, product: "Other" });
  expect((await a.state())?.product).toBe("CRM");
  expect((await db.select().from(acquisition)).length).toBe(2);
});
it("rejects unauthenticated access", async () => {
  const ctx = await context("a@test.com");
  await expect(
    caller({ ...ctx, user: null, session: null }).state(),
  ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
});
it("schedules once at the next Beijing 09:00", () => {
  expect(nextDailyRun(new Date("2026-10-14T00:59:00Z")).toISOString()).toBe(
    "2026-10-14T01:00:00.000Z",
  );
  expect(nextDailyRun(new Date("2026-10-14T01:00:00Z")).toISOString()).toBe(
    "2026-10-15T01:00:00.000Z",
  );
});

it("isolates reply drafts by owner and preserves review status", async () => {
  const ownerCtx = await context("owner@test.com");
  const owner = caller(ownerCtx);
  const other = caller(await context("other@test.com"));
  await owner.save(config);
  const lead = {
    ...createInitialData().leads[0],
    review: "contacted" as const,
    suggestion: "Reviewed",
  };
  await db
    .update(acquisition)
    .set({ leads: [lead] })
    .where(eq(acquisition.userId, ownerCtx.user!.id));
  const input = {
    id: lead.id,
    tone: "professional" as const,
    thoughts: "My real thoughts",
  };
  await expect(other.generateReply(input)).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  await expect(
    other.saveReply({ ...input, text: "Injected" }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  const draft = await owner.generateReply(input);
  expect(draft.method).toBe("template");
  expect(draft.text).toContain("My real thoughts");
  expect((await owner.state())?.leads[0].replyDraft).toBeUndefined();
  await owner.saveReply({ ...input, text: "Human edited reply" });
  const saved = (await owner.state())?.leads[0];
  expect(saved?.replyDraft?.text).toBe("Human edited reply");
  expect(saved?.review).toBe("contacted");
});
