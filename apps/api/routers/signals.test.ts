import { user, identity } from "@repo/db";
import { createTestDatabase } from "@repo/db/testing";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { TRPCContext } from "../lib/context";
import { createCallerFactory } from "../lib/trpc";
import { xOAuthConnection } from "../services/x-oauth";
import { signalsRouter } from "./signals";

const database = await createTestDatabase();
afterAll(database.close);
beforeEach(database.reset);
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
      TWITTER_CLIENT_ID: "client",
      TWITTER_CLIENT_SECRET: "secret",
    },
  };
}

describe("per-user OAuth connection", () => {
  it("isolates identities and never returns tokens", async () => {
    await database.db.insert(user).values([
      { id: "u", name: "A", email: "a@example.com" },
      { id: "v", name: "B", email: "b@example.com" },
    ]);
    await database.db.insert(identity).values({
      id: "x-b",
      userId: "v",
      providerId: "twitter",
      accountId: "other-x",
      accessToken: "secret-other",
      refreshToken: "refresh-other",
      scope: "tweet.read,users.read,list.read,offline.access",
    });
    const caller = createCaller(context(true));
    expect((await caller.connection()).connected).toBe(false);
    expect((await caller.disconnect()).disconnected).toBe(true);
    expect((await database.db.query.identity.findFirst())?.accountId).toBe(
      "other-x",
    );
    await database.db.insert(identity).values({
      id: "x-a",
      userId: "u",
      providerId: "twitter",
      accountId: "my-x",
      accessToken: "secret-mine",
      refreshToken: "refresh-mine",
      scope: "tweet.read,users.read,list.read,offline.access",
    });
    const status = await caller.connection();
    expect(status.allowed).toBe(true);
    expect(status.xAccountId).toBe("my-x");
    expect(JSON.stringify(status)).not.toContain("secret");
  });
  it("requires complete scopes and a refresh grant", async () => {
    await database.db
      .insert(user)
      .values({ id: "u", name: "A", email: "a@example.com" });
    await database.db.insert(identity).values({
      id: "x-a",
      userId: "u",
      providerId: "twitter",
      accountId: "my-x",
      accessToken: "secret",
      scope: "tweet.read,users.read",
    });
    const status = await xOAuthConnection(context(true), "u");
    expect(status.allowed).toBe(false);
    expect(status.missingScopes).toContain("offline.access");
  });
  it("rejects unauthenticated reads and unconnected runs before X is fetched", async () => {
    await expect(
      createCaller(context(false)).connection(),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    const spy = vi.spyOn(globalThis, "fetch");
    try {
      await expect(
        createCaller(context(true)).discover({
          id: "a",
          name: "Sales",
          icpDescription: "SaaS",
          precisionMode: "standard",
          signals: [{ type: "keyword", value: "AI" }],
        }),
      ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
      await expect(
        createCaller(context(true)).recentOwnPosts(),
      ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
  it("does not publish with a read-only X grant", async () => {
    await database.db
      .insert(user)
      .values({ id: "u", name: "A", email: "a@example.com" });
    await database.db.insert(identity).values({
      id: "x-a",
      userId: "u",
      providerId: "twitter",
      accountId: "my-x",
      accessToken: "secret",
      refreshToken: "refresh",
      scope: "tweet.read,users.read,list.read,offline.access",
    });
    const spy = vi.spyOn(globalThis, "fetch");
    try {
      await expect(
        createCaller(context(true)).publish({ text: "Hello" }),
      ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
  it("rejects malformed Inspiration account filters before contacting X", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    try {
      await expect(
        createCaller(context(true)).searchPosts({
          query: "AI",
          mediaOnly: false,
          period: "day",
          account: "bad handle OR from:other",
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});
