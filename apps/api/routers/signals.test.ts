import { createTestDatabase } from "@repo/db/testing";
import { afterAll, describe, expect, it, vi } from "vitest";

import type { TRPCContext } from "../lib/context";
import { createCallerFactory } from "../lib/trpc";
import { signalsRouter, xConnection } from "./signals";

const database = await createTestDatabase();
afterAll(database.close);
const createCaller = createCallerFactory(signalsRouter);
function context(signedIn: boolean): TRPCContext {
  const now = new Date();
  return {
    req: new Request("http://localhost"),
    info: {} as TRPCContext["info"],
    db: database.db,
    dbCached: database.db,
    session: signedIn
      ? {
          id: "s",
          userId: "u",
          token: "t",
          createdAt: now,
          updatedAt: now,
          expiresAt: new Date(Date.now() + 60000),
        }
      : null,
    user: signedIn
      ? {
          id: "u",
          name: "Test",
          email: "test@example.com",
          emailVerified: true,
          createdAt: now,
          updatedAt: now,
        }
      : null,
    env: {
      ENVIRONMENT: "development",
      APP_NAME: "Test",
      APP_ORIGIN: "http://localhost",
      BETTER_AUTH_SECRET: "0".repeat(32),
      RESEND_API_KEY: "unused",
      RESEND_EMAIL_FROM: "test@example.com",
      X_BEARER_TOKEN: "secret",
    },
  };
}

describe("real X access configuration", () => {
  it("requires an explicit user allowlist even when a token exists", () => {
    expect(xConnection({ X_BEARER_TOKEN: "secret" }, "user-1").allowed).toBe(
      false,
    );
    expect(
      xConnection(
        { X_BEARER_TOKEN: "secret", X_ALLOWED_USER_IDS: "user-1, user-2" },
        "user-1",
      ),
    ).toEqual({
      configured: true,
      allowed: true,
      userId: "user-1",
      maxPostsPerRun: 30,
    });
  });
  it("returns readiness but never the token", () => {
    expect(
      JSON.stringify(
        xConnection({ X_BEARER_TOKEN: "secret", X_ALLOWED_USER_IDS: "u" }, "u"),
      ),
    ).not.toContain("secret");
    expect(xConnection({}, "u").configured).toBe(false);
  });
  it("caps the configured read count", () => {
    expect(xConnection({ X_MAX_POSTS_PER_RUN: 1000 }, "u").maxPostsPerRun).toBe(
      100,
    );
    expect(
      xConnection({ X_MAX_POSTS_PER_RUN: Number.NaN }, "u").maxPostsPerRun,
    ).toBe(30);
  });
  it("rejects unauthenticated reads and disallowed paid runs before fetching X", async () => {
    await expect(
      createCaller(context(false)).connection(),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      await expect(
        createCaller(context(true)).discover({
          id: "agent",
          name: "Sales",
          icpDescription: "SaaS",
          precisionMode: "standard",
          signals: [{ type: "keyword", value: "AI" }],
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
