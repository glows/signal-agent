import { createInitialData } from "@repo/core/signals";
import { acquisition, identity, user } from "@repo/db";
import { createTestDatabase } from "@repo/db/testing";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";

import { createAuth } from "../lib/auth";
import { mergeAcquisitionLeads, runAcquisition } from "./acquisition";
import { discoverXLeads, XDataError } from "./x-data";
vi.mock("./x-data", async (original) => {
  const actual = await original<typeof import("./x-data")>();
  return { ...actual, discoverXLeads: vi.fn() };
});
const { db, reset, close } = await createTestDatabase();
beforeEach(reset);
afterAll(close);
afterEach(() => vi.restoreAllMocks());
const env = {
  ENVIRONMENT: "development" as const,
  APP_NAME: "Test",
  APP_ORIGIN: "http://localhost:5174",
  BETTER_AUTH_SECRET: "s".repeat(32),
  RESEND_API_KEY: "unused",
  RESEND_EMAIL_FROM: "test@example.com",
  TWITTER_CLIENT_ID: "test",
  TWITTER_CLIENT_SECRET: "test",
};
async function setup() {
  await db
    .insert(user)
    .values({ id: "u", name: "Test", email: "t@example.com" });
  await db.insert(identity).values({
    id: "x",
    userId: "u",
    accountId: "42",
    providerId: "twitter",
    scope: "tweet.read users.read list.read offline.access",
  });
  await db.insert(acquisition).values({
    id: "a",
    userId: "u",
    product: "CRM",
    agent: {
      name: "Daily",
      icpDescription: "CRM",
      precisionMode: "high",
      signals: [{ type: "keyword", value: "CRM" }],
    },
    enabled: true,
    dailyLimit: 30,
    nextRunAt: new Date(),
  });
  const auth = createAuth(db, env);
  vi.spyOn(auth.api, "getAccessToken").mockResolvedValue({
    accessToken: "test",
    accessTokenExpiresAt: undefined,
    scopes: [],
    idToken: undefined,
  });
  return auth;
}
it("prevents concurrent runs and reserves the daily budget", async () => {
  const auth = await setup();
  let resolve: () => void = () => {};
  const gate = new Promise<void>((done) => {
    resolve = done;
  });
  vi.mocked(discoverXLeads).mockImplementation(async () => {
    await gate;
    return {
      leads: [],
      postsScanned: 0,
      candidatesScored: 0,
      checkedAt: new Date().toISOString(),
    };
  });
  const first = runAcquisition(db, auth, env, "u", "manual");
  await vi.waitFor(() => expect(discoverXLeads).toHaveBeenCalled());
  await expect(runAcquisition(db, auth, env, "u", "daily")).rejects.toThrow();
  resolve();
  await first;
  await expect(runAcquisition(db, auth, env, "u", "manual")).rejects.toThrow(
    "预算",
  );
  const [row] = await db
    .select()
    .from(acquisition)
    .where(eq(acquisition.id, "a"));
  expect(row.runs[0].status).toBe("success");
});
it("pauses daily discovery after 402 and keeps a safe error in the brief", async () => {
  const auth = await setup();
  vi.mocked(discoverXLeads).mockRejectedValue(
    new XDataError("billing", "X API 返回 402，请检查 Credits。"),
  );
  await runAcquisition(db, auth, env, "u", "daily");
  const [row] = await db.select().from(acquisition);
  expect(row.enabled).toBe(false);
  expect(row.runs[0].status).toBe("failed");
  expect(row.runs[0].message).toContain("402");
  expect(row.runs[0].scanned).toBe(30);
});

it("deduplicates by X user and retains previous review feedback", () => {
  const lead = createInitialData().leads[0];
  const existing = {
    ...lead,
    review: "contacted" as const,
    suggestion: "Reviewed",
  };
  expect(mergeAcquisitionLeads([existing], [lead]).leads[0].review).toBe(
    "contacted",
  );
  expect(mergeAcquisitionLeads([], [lead, lead]).added).toBe(1);
});
