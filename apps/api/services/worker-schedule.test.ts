import { nextWorkerRun } from "@repo/core/worker-schedule";
import { studioState, user } from "@repo/db";
import { createTestDatabase } from "@repo/db/testing";
import { afterAll, beforeEach, expect, it, vi } from "vitest";

import { sweepScheduledWorkers } from "./worker-schedule";

const { db, reset, close } = await createTestDatabase();
beforeEach(reset);
afterAll(close);

it("uses the account timezone for daily and weekly schedules", () => {
  const now = new Date("2026-10-15T00:00:00Z");
  expect(
    nextWorkerRun(
      { frequency: "daily", time: "09:00", weekday: 1 },
      "Asia/Shanghai",
      now,
    ),
  ).toBe("2026-10-15T01:00:00.000Z");
  expect(
    nextWorkerRun(
      { frequency: "weekly", time: "09:00", weekday: 1 },
      "Asia/Shanghai",
      now,
    ),
  ).toBe("2026-10-19T01:00:00.000Z");
});

it("generates review drafts once for a due worker and never publishes", async () => {
  const [person] = await db
    .insert(user)
    .values({ name: "Writer", email: "writer@test.com", emailVerified: true })
    .returning();
  await db.insert(studioState).values({
    userId: person.id,
    data: {
      version: 1,
      timezone: "Asia/Shanghai",
      posts: [],
      workers: [
        {
          id: "worker-1",
          name: "Daily",
          topic: "AI 产品",
          voice: "mine",
          instructions: "",
          count: 2,
          active: true,
          schedule: {
            frequency: "daily",
            time: "09:00",
            weekday: 1,
            nextRunAt: "2026-10-15T01:00:00.000Z",
          },
        },
      ],
    },
  });
  const run = vi
    .fn()
    .mockResolvedValue({ response: '{"drafts":["第一条","第二条"]}' });
  const env = { AI: { run } } as unknown as Parameters<
    typeof sweepScheduledWorkers
  >[1];
  const now = new Date("2026-10-15T01:00:00.000Z");
  await sweepScheduledWorkers(db, env, now);
  await sweepScheduledWorkers(db, env, now);
  const [row] = await db.select().from(studioState);
  expect(run).toHaveBeenCalledOnce();
  expect(row.data.posts).toMatchObject([
    { status: "review", text: "第一条" },
    { status: "review", text: "第二条" },
  ]);
  expect(row.data.workers).toMatchObject([
    {
      schedule: {
        nextRunAt: "2026-10-16T01:00:00.000Z",
        lastRunStatus: "success",
      },
    },
  ]);
});

it("records a failed run without publishing or retrying the same slot", async () => {
  const [person] = await db
    .insert(user)
    .values({ name: "Writer", email: "failed@test.com", emailVerified: true })
    .returning();
  await db.insert(studioState).values({
    userId: person.id,
    data: {
      version: 1,
      timezone: "Asia/Shanghai",
      posts: [],
      workers: [
        {
          id: "worker-1",
          name: "Daily",
          topic: "AI",
          voice: "mine",
          instructions: "",
          count: 1,
          active: true,
          schedule: {
            frequency: "daily",
            time: "09:00",
            weekday: 1,
            nextRunAt: "2026-10-15T01:00:00.000Z",
          },
        },
      ],
    },
  });
  const run = vi.fn().mockRejectedValue(new Error("model unavailable"));
  const env = { AI: { run } } as unknown as Parameters<
    typeof sweepScheduledWorkers
  >[1];
  const now = new Date("2026-10-15T01:00:00.000Z");
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    await sweepScheduledWorkers(db, env, now);
    await sweepScheduledWorkers(db, env, now);
  } finally {
    log.mockRestore();
  }
  const [row] = await db.select().from(studioState);
  expect(run).toHaveBeenCalledOnce();
  expect(row.data.posts).toEqual([]);
  expect(row.data.workers).toMatchObject([
    {
      schedule: {
        lastRunStatus: "failed",
        nextRunAt: "2026-10-16T01:00:00.000Z",
      },
    },
  ]);
});
