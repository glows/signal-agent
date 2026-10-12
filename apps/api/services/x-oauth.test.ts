import { identity, user } from "@repo/db";
import { createTestDatabase } from "@repo/db/testing";
import { symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  createAuth,
  configuredSocialProviders,
  socialProviders,
  type AuthEnv,
} from "../lib/auth";

const database = await createTestDatabase();
beforeEach(database.reset);
afterEach(() => vi.restoreAllMocks());
afterAll(database.close);
const env: AuthEnv = {
  ENVIRONMENT: "development",
  APP_NAME: "Test",
  APP_ORIGIN: "http://127.0.0.1:5174",
  BETTER_AUTH_SECRET: "s".repeat(32),
  RESEND_API_KEY: "unused",
  RESEND_EMAIL_FROM: "test@example.com",
  TWITTER_CLIENT_ID: "client",
  TWITTER_CLIENT_SECRET: "client-secret",
};

describe("X OAuth configuration and refresh", () => {
  it("enables X only with complete credentials and includes list reads", () => {
    expect(configuredSocialProviders(env)).toContain("twitter");
    expect(socialProviders(env).twitter?.scope).toContain("list.read");
    expect(() =>
      socialProviders({ ...env, TWITTER_CLIENT_SECRET: undefined }),
    ).toThrow("both");
    expect(
      createAuth(database.db, env).options.account?.encryptOAuthTokens,
    ).toBe(true);
  });

  it("refreshes expired encrypted tokens and persists the rotated refresh token", async () => {
    await database.db
      .insert(user)
      .values({ id: "u", name: "Test", email: "test@example.com" });
    await database.db.insert(identity).values({
      id: "idn_x",
      userId: "u",
      accountId: "42",
      providerId: "twitter",
      accessToken: await symmetricEncrypt({
        key: env.BETTER_AUTH_SECRET,
        data: "expired",
      }),
      refreshToken: await symmetricEncrypt({
        key: env.BETTER_AUTH_SECRET,
        data: "old-refresh",
      }),
      accessTokenExpiresAt: new Date(Date.now() - 1000),
      scope: "tweet.read,users.read,list.read,offline.access",
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        access_token: "renewed",
        refresh_token: "rotated-refresh",
        expires_in: 7200,
        token_type: "bearer",
        scope: "tweet.read users.read list.read offline.access",
      }),
    );
    const auth = createAuth(database.db, env);
    const result = await auth.api.getAccessToken({
      body: { accountId: "idn_x", userId: "u" },
    });
    expect(result.accessToken).toBe("renewed");
    expect(fetchSpy).toHaveBeenCalled();
    const saved = await database.db.query.identity.findFirst();
    expect(saved?.refreshToken).not.toBe("rotated-refresh");
    expect(
      await symmetricDecrypt({
        key: env.BETTER_AUTH_SECRET,
        data: saved!.refreshToken!,
      }),
    ).toBe("rotated-refresh");
  });
});
