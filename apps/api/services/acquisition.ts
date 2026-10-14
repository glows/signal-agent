import {
  acquisition,
  generateId,
  identity,
  type AcquisitionLead,
  type AcquisitionRun,
  type Database,
} from "@repo/db";
import { and, eq, lte } from "drizzle-orm";

import type { Auth } from "../lib/auth.js";
import type { Env } from "../lib/env.js";
import { discoverXLeads, XDataError } from "./x-data.js";
import { X_READ_SCOPES } from "./x-oauth.js";

// Fixed UTC+8, 09:00 daily. A missed run executes once, without backfilling.
export function nextDailyRun(now = new Date()) {
  const day = new Date(now);
  day.setUTCHours(1, 0, 0, 0);
  if (day <= now) day.setUTCDate(day.getUTCDate() + 1);
  return day;
}
export function mergeAcquisitionLeads(
  existing: AcquisitionLead[],
  incoming: Awaited<ReturnType<typeof discoverXLeads>>["leads"],
) {
  const seen = new Set(existing.map((lead) => lead.person.id));
  const fresh: AcquisitionLead[] = [];
  for (const lead of incoming) {
    if (lead.score < 60 || seen.has(lead.person.id)) continue;
    seen.add(lead.person.id);
    fresh.push({
      ...lead,
      review: "new",
      suggestion: `针对来源中“${lead.provenance.source.slice(0, 100)}”表达的问题，先确认对方当前使用的方案和主要困难，再说明你的产品是否能解决这一点。`,
    });
  }
  return { leads: [...fresh, ...existing].slice(0, 1000), added: fresh.length };
}
export async function runAcquisition(
  db: Database,
  auth: Auth,
  _env: Env,
  userId: string,
  trigger: "manual" | "daily",
  now = new Date(),
) {
  const { row, run, history, perSourceBudget } = await db.transaction(
    async (tx) => {
      const [row] = await tx
        .select()
        .from(acquisition)
        .where(eq(acquisition.userId, userId))
        .for("update");
      if (!row) throw new Error("请先保存获客配置。");
      if (trigger === "daily" && (!row.enabled || row.nextRunAt > now))
        throw new Error("任务已暂停或尚未到运行时间。");
      if (row.leaseUntil && row.leaseUntil > now)
        throw new Error("已有发现任务正在运行，请稍后查看简报。");
      const localDay = (date: Date) =>
        new Date(date.getTime() + 8 * 3600_000).toISOString().slice(0, 10);
      const used = row.runs
        .filter((item) => localDay(new Date(item.startedAt)) === localDay(now))
        .reduce((sum, item) => sum + item.scanned, 0);
      const perSourceBudget = row.dailyLimit - used;
      if (perSourceBudget < 30)
        throw new Error("已达到今日读取预算，明日再运行。");
      const run: AcquisitionRun = {
        id: generateId("run"),
        startedAt: now.toISOString(),
        status: "running",
        scanned: perSourceBudget,
        added: 0,
        trigger,
      };
      const history = [
        run,
        ...row.runs.map((item) =>
          item.status === "running"
            ? {
                ...item,
                status: "failed" as const,
                message: "上次任务中断或超时，预算已保留。",
              }
            : item,
        ),
      ].slice(0, 60);
      await tx
        .update(acquisition)
        .set({
          leaseId: run.id,
          leaseUntil: new Date(now.getTime() + 10 * 60_000),
          nextRunAt: nextDailyRun(now),
          runs: history,
        })
        .where(eq(acquisition.id, row.id));
      return { row, run, history, perSourceBudget };
    },
  );
  const leaseId = run.id;
  let authorizationReady = false;
  try {
    const account = await db.query.identity.findFirst({
      where: and(
        eq(identity.userId, userId),
        eq(identity.providerId, "twitter"),
      ),
    });
    if (
      !account ||
      X_READ_SCOPES.some(
        (scope) => !(account.scope ?? "").split(/[ ,]+/).includes(scope),
      )
    )
      throw new Error("X 授权缺失或权限不足，请重新连接 X。");
    // Trusted internal call: no HTTP headers, and an explicitly scoped owner.
    const token = await auth.api.getAccessToken({
      body: { accountId: account.id, userId },
    });
    if (!token.accessToken) throw new Error("X 授权刷新失败，请重新连接。");
    authorizationReady = true;
    const result = await discoverXLeads(
      { ...row.agent, id: row.id },
      token.accessToken,
      perSourceBudget,
    );
    // Reload after the network call to retain reviews made during discovery.
    await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(acquisition)
        .where(eq(acquisition.id, row.id))
        .for("update");
      if (!current || current.leaseId !== leaseId) return;
      const merged = mergeAcquisitionLeads(current.leads, result.leads);
      run.status = "success";
      run.added = merged.added;
      run.finishedAt = new Date().toISOString();
      await tx
        .update(acquisition)
        .set({
          leads: merged.leads,
          runs: [run, ...history.slice(1)],
          leaseUntil: null,
          leaseId: null,
        })
        .where(eq(acquisition.id, row.id));
    });
  } catch (error) {
    run.status = "failed";
    run.finishedAt = new Date().toISOString();
    run.message =
      error instanceof XDataError
        ? error.message
        : "发现失败：请检查 X 授权或网络连接。";
    await db
      .update(acquisition)
      .set({
        runs: [run, ...history.slice(1)],
        leaseUntil: null,
        leaseId: null,
        enabled:
          !authorizationReady ||
          (error instanceof XDataError &&
            (error.kind === "billing" || error.kind === "configuration"))
            ? false
            : row.enabled,
      })
      .where(and(eq(acquisition.id, row.id), eq(acquisition.leaseId, leaseId)));
  }
  return run;
}
export async function sweepAcquisition(
  db: Database,
  auth: Auth,
  env: Env,
  now = new Date(),
) {
  const due = await db
    .select({ userId: acquisition.userId })
    .from(acquisition)
    .where(and(eq(acquisition.enabled, true), lte(acquisition.nextRunAt, now)))
    .limit(10);
  for (const row of due) {
    try {
      await runAcquisition(db, auth, env, row.userId, "daily", now);
    } catch {
      /* A competing sweep or exhausted budget is skipped until the next tick. */
    }
  }
}
