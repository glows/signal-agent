import { user } from "@repo/db";
import { createTestDatabase } from "@repo/db/testing";
import { afterAll, beforeEach, expect, it, vi } from "vitest";

import type { TRPCContext } from "../lib/context";
import { createCallerFactory } from "../lib/trpc";
import { studioRouter } from "./studio";

const { db, reset, close } = await createTestDatabase();
beforeEach(reset);
afterAll(close);
const caller = createCallerFactory(studioRouter);

async function context(email: string): Promise<TRPCContext> {
  const [person] = await db
    .insert(user)
    .values({ name: "Studio User", email, emailVerified: true })
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
      expiresAt: new Date(Date.now() + 10_000),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };
}

it("migrates local data once and isolates accounts", async () => {
  const a = caller(await context("a@test.com"));
  const b = caller(await context("b@test.com"));
  expect(await a.read()).toBeNull();
  await a.save({
    expectedRevision: 0,
    data: { version: 1, contacts: [{ id: "1" }] },
  });
  expect(await a.read()).toMatchObject({
    revision: 1,
    data: { contacts: [{ id: "1" }] },
  });
  expect(await b.read()).toBeNull();
  await expect(
    b.save({ expectedRevision: 0, data: { version: 1, contacts: [] } }),
  ).resolves.toEqual({ revision: 1 });
  expect((await a.read())?.data).toMatchObject({ contacts: [{ id: "1" }] });
});

it("rejects stale writes without losing the newer version", async () => {
  const a = caller(await context("a@test.com"));
  await a.save({ expectedRevision: 0, data: { version: 1, about: "first" } });
  await a.save({ expectedRevision: 1, data: { version: 1, about: "second" } });
  await expect(
    a.save({ expectedRevision: 1, data: { version: 1, about: "stale" } }),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  expect((await a.read())?.data).toMatchObject({ about: "second" });
});

it("generates drafts only for signed-in users with an AI binding", async () => {
  const ctx = await context("writer@test.com");
  const input = {
    topic: "AI 产品",
    audience: "创始人",
    about: "",
    styleGuide: "",
    instructions: "",
    voice: "mine" as const,
    count: 2,
    noQuestions: false,
    noNumberedLists: false,
    examples: [],
  };
  await expect(caller(ctx).generateWorker(input)).rejects.toMatchObject({
    code: "PRECONDITION_FAILED",
  });
  const run = vi
    .fn()
    .mockResolvedValue({ response: '{"drafts":["第一篇","第二篇"]}' });
  const withAi = caller({
    ...ctx,
    env: { ...ctx.env, AI: { run } as unknown as Ai },
  });
  await expect(withAi.generateWorker(input)).resolves.toEqual({
    drafts: ["第一篇", "第二篇"],
  });
  expect(run).toHaveBeenCalledOnce();
  await expect(
    caller({ ...ctx, user: null, session: null }).generateWorker(input),
  ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
});
