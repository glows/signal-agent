import { nextWorkerRun, type WorkerSchedule } from "@repo/core/worker-schedule";
import { studioState, type Database } from "@repo/db";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import type { Env } from "../lib/env.js";
import {
  parseWorkerDrafts,
  workerDraftInput,
  workerDraftPrompt,
} from "./worker-drafts.js";

const scheduleSchema = z.object({
  frequency: z.enum(["daily", "weekly"]),
  time: z.string(),
  weekday: z.number().int().min(0).max(6),
  nextRunAt: z.iso.datetime(),
  lastRunAt: z.iso.datetime().optional(),
  lastRunStatus: z.enum(["running", "success", "failed"]).optional(),
});
const workerSchema = z.object({
  id: z.string(),
  active: z.boolean(),
  name: z.string(),
  topic: z.string(),
  voice: z.enum(["mine", "creator", "hybrid"]),
  instructions: z.string(),
  count: z.number().int().min(1).max(6),
  voiceExamples: z.array(z.string()).optional(),
  schedule: scheduleSchema.optional(),
});
type ScheduledWorker = z.infer<typeof workerSchema>;

function eligibleWorkers(data: Record<string, unknown>, now: Date) {
  const workers = z.array(workerSchema).safeParse(data.workers);
  if (!workers.success) return [];
  return workers.data.filter(
    (worker) =>
      worker.active &&
      worker.schedule &&
      Date.parse(worker.schedule.nextRunAt) <= now.getTime(),
  );
}

async function saveDrafts(
  db: Database,
  userId: string,
  worker: ScheduledWorker,
  drafts: string[],
  now: Date,
  claimedNextRunAt: string,
) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const [row] = await db
      .select()
      .from(studioState)
      .where(eq(studioState.userId, userId));
    if (!row) return;
    const current = z.array(workerSchema).safeParse(row.data.workers);
    if (
      !current.success ||
      !current.data.some(
        (item) =>
          item.id === worker.id &&
          item.active &&
          item.schedule?.nextRunAt === claimedNextRunAt,
      )
    )
      return;
    const posts = Array.isArray(row.data.posts) ? row.data.posts : [];
    const generated = drafts.map((text) => ({
      id: crypto.randomUUID(),
      text,
      status: "review",
      createdAt: now.toISOString(),
      workerId: worker.id,
      reviewBrief: `按计划 AI 生成 · ${worker.name} · ${worker.topic || "我的专业领域"}`,
    }));
    const [saved] = await db
      .update(studioState)
      .set({
        data: { ...row.data, posts: [...generated, ...posts] },
        revision: row.revision + 1,
        updatedAt: now,
      })
      .where(
        and(
          eq(studioState.userId, userId),
          eq(studioState.revision, row.revision),
        ),
      )
      .returning({ revision: studioState.revision });
    if (saved) return;
  }
  throw new Error(`Could not save scheduled drafts for ${userId}`);
}

async function setRunStatus(
  db: Database,
  userId: string,
  workerId: string,
  runAt: string,
  status: "success" | "failed",
) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const [row] = await db
      .select()
      .from(studioState)
      .where(eq(studioState.userId, userId));
    if (!row || !Array.isArray(row.data.workers)) return;
    const workers = (row.data.workers as Record<string, unknown>[]).map(
      (item) => {
        const schedule = scheduleSchema.safeParse(item.schedule);
        return item.id === workerId &&
          schedule.success &&
          schedule.data.lastRunAt === runAt
          ? { ...item, schedule: { ...schedule.data, lastRunStatus: status } }
          : item;
      },
    );
    const [saved] = await db
      .update(studioState)
      .set({
        data: { ...row.data, workers },
        revision: row.revision + 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(studioState.userId, userId),
          eq(studioState.revision, row.revision),
        ),
      )
      .returning({ revision: studioState.revision });
    if (saved) return;
  }
}

export async function sweepScheduledWorkers(
  db: Database,
  env: Env,
  now = new Date(),
) {
  if (!env.AI) return;
  const rows = await db
    .select()
    .from(studioState)
    .where(sql`EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(${studioState.data}->'workers', '[]'::jsonb)) AS worker
    WHERE worker->>'active' = 'true' AND worker->'schedule'->>'nextRunAt' <= ${now.toISOString()}
  )`)
    .limit(10);
  for (const row of rows) {
    for (const worker of eligibleWorkers(row.data, now)) {
      const schedule = worker.schedule as WorkerSchedule;
      const timezone =
        typeof row.data.timezone === "string"
          ? row.data.timezone
          : "Asia/Shanghai";
      const nextRunAt = nextWorkerRun(schedule, timezone, now);
      if (!nextRunAt) continue;
      const workers = (row.data.workers as Record<string, unknown>[]).map(
        (item) =>
          item.id === worker.id
            ? {
                ...item,
                schedule: {
                  ...schedule,
                  nextRunAt,
                  lastRunAt: now.toISOString(),
                  lastRunStatus: "running",
                },
              }
            : item,
      );
      const [claimed] = await db
        .update(studioState)
        .set({
          data: { ...row.data, workers },
          revision: row.revision + 1,
          updatedAt: now,
        })
        .where(
          and(
            eq(studioState.userId, row.userId),
            eq(studioState.revision, row.revision),
          ),
        )
        .returning({ revision: studioState.revision });
      if (!claimed) break;
      try {
        const firstProduct =
          Array.isArray(row.data.products) &&
          typeof row.data.products[0] === "string"
            ? row.data.products[0]
            : "";
        const savedExamples = (worker.voiceExamples ?? []).filter(
          (text) => text.length > 0 && text.length <= 280,
        );
        const publishedExamples = (
          Array.isArray(row.data.posts) ? row.data.posts : []
        )
          .filter(
            (post): post is { status: string; text: string } =>
              typeof post === "object" &&
              post !== null &&
              post.status === "published" &&
              typeof post.text === "string",
          )
          .map((post) => post.text.trim())
          .filter((text) => text.length > 0 && text.length <= 280);
        const input = workerDraftInput.parse({
          topic: (worker.topic || firstProduct || "我的专业领域").slice(0, 200),
          audience:
            typeof row.data.audience === "string"
              ? row.data.audience.slice(0, 600)
              : "",
          about:
            typeof row.data.about === "string"
              ? row.data.about.slice(0, 500)
              : "",
          styleGuide:
            typeof row.data.vocabulary === "string"
              ? row.data.vocabulary.slice(0, 1200)
              : "",
          instructions: worker.instructions.slice(0, 600),
          voice: worker.voice,
          count: worker.count,
          noQuestions:
            (row.data.writingRules as { noQuestions?: boolean } | undefined)
              ?.noQuestions === true,
          noNumberedLists:
            (row.data.writingRules as { noNumberedLists?: boolean } | undefined)
              ?.noNumberedLists === true,
          examples:
            worker.voice === "creator"
              ? []
              : (savedExamples.length
                  ? savedExamples
                  : publishedExamples
                ).slice(0, 5),
        });
        const response = await env.AI.run(
          "@cf/meta/llama-3.1-8b-instruct-fp8",
          {
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
          },
        );
        await saveDrafts(
          db,
          row.userId,
          worker,
          parseWorkerDrafts(response, worker.count),
          now,
          nextRunAt,
        );
        await setRunStatus(
          db,
          row.userId,
          worker.id,
          now.toISOString(),
          "success",
        );
      } catch (error) {
        await setRunStatus(
          db,
          row.userId,
          worker.id,
          now.toISOString(),
          "failed",
        );
        console.error(
          "Scheduled worker generation failed",
          row.userId,
          worker.id,
          error,
        );
      }
    }
  }
}
