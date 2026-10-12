import { describe, expect, it } from "vitest";

import { discoverXLeads, fetchXPeople } from "./x-data";

const sampleUser = {
  id: "42",
  username: "liamfounder",
  name: "Liam",
  description: "AI SaaS 创始人，寻找销售线索工具",
  public_metrics: { followers_count: 100 },
};
const samplePost = {
  id: "101",
  author_id: "42",
  text: "正在寻找 AI SaaS 销售线索工具",
  created_at: "2026-10-12T00:00:00Z",
};
const payload = { data: [samplePost], includes: { users: [sampleUser] } };

describe("X data connector", () => {
  it("explains payment-required responses without treating them as lost OAuth grants", async () => {
    await expect(
      fetchXPeople(
        [{ type: "keyword", value: "AI" }],
        "token",
        30,
        async () => new Response("", { status: 402 }),
      ),
    ).rejects.toMatchObject({
      kind: "billing",
      message: expect.stringContaining("Credits"),
    });
  });
  it("reads X only from the backend and preserves the original post", async () => {
    const requests: string[] = [];
    const result = await discoverXLeads(
      {
        id: "agent",
        name: "Sales",
        precisionMode: "standard",
        icpDescription: "AI SaaS 创始人销售线索",
        signals: [{ type: "keyword", value: "AI" }],
      },
      "test-token",
      30,
      async (url, init) => {
        requests.push(url);
        expect(init?.headers).toEqual({ Authorization: "Bearer test-token" });
        return Response.json(payload);
      },
    );
    expect(new URL(requests[0]).hostname).toBe("api.x.com");
    expect(result.leads).toHaveLength(1);
    expect(result.leads[0].dataSource).toBe("x");
    expect(result.leads[0].provenance.postUrl).toBe(
      "https://x.com/liamfounder/status/101",
    );
    expect(result.postsScanned).toBe(1);
  });

  it("resolves profile handles and public list IDs, merging repeated authors", async () => {
    const paths: string[] = [];
    const result = await fetchXPeople(
      [
        { type: "profile_watch", value: "@liamfounder" },
        { type: "list_watch", value: "https://x.com/i/lists/123" },
      ],
      "token",
      30,
      async (url) => {
        const pathname = new URL(url).pathname;
        paths.push(pathname);
        return Response.json(
          pathname.includes("by/username") ? { data: sampleUser } : payload,
        );
      },
    );
    expect(paths).toEqual([
      "/2/users/by/username/liamfounder",
      "/2/users/42/tweets",
      "/2/lists/123/tweets",
    ]);
    expect(result.people).toHaveLength(1);
    expect(result.people[0].posts).toHaveLength(1);
    expect(result.people[0].lists).toContain("https://x.com/i/lists/123");
  });

  it("bounds post reads and rejects arbitrary list destinations", async () => {
    await expect(
      fetchXPeople(
        [{ type: "list_watch", value: "http://internal/123" }],
        "token",
        30,
      ),
    ).rejects.toThrow("公开 X 列表");
    const result = await fetchXPeople(
      [{ type: "keyword", value: "AI" }],
      "token",
      30,
      async (url) => {
        expect(new URL(url).searchParams.get("max_results")).toBe("30");
        return Response.json({
          data: Array.from({ length: 40 }, (_, index) => ({
            ...samplePost,
            id: String(index),
          })),
          includes: { users: [sampleUser] },
        });
      },
    );
    expect(result.postsScanned).toBe(30);
  });
  it("validates every target before spending requests on earlier signals", async () => {
    let requests = 0;
    await expect(
      fetchXPeople(
        [
          { type: "keyword", value: "AI" },
          { type: "list_watch", value: "invalid-list" },
        ],
        "token",
        30,
        async () => {
          requests += 1;
          return Response.json(payload);
        },
      ),
    ).rejects.toThrow("公开 X 列表");
    expect(requests).toBe(0);
  });

  it("reports rate limits without leaking token or upstream response", async () => {
    await expect(
      fetchXPeople(
        [{ type: "keyword", value: "AI" }],
        "secret",
        30,
        async () => new Response("secret", { status: 429 }),
      ),
    ).rejects.toThrow("限流或额度不足");
  });

  it("does not pretend malformed or partial upstream data is an empty search", async () => {
    await expect(
      fetchXPeople([{ type: "keyword", value: "AI" }], "token", 30, async () =>
        Response.json({ errors: [{ detail: "unavailable" }] }),
      ),
    ).rejects.toThrow("不完整");
    await expect(
      fetchXPeople([{ type: "keyword", value: "AI" }], "token", 30, async () =>
        Response.json({}),
      ),
    ).rejects.toThrow("不完整");
  });

  it("uses X query matches instead of treating advanced queries as literal text", async () => {
    const result = await discoverXLeads(
      {
        id: "agent",
        name: "Sales",
        precisionMode: "standard",
        icpDescription: "AI SaaS 创始人销售线索",
        signals: [
          { type: "keyword", value: '("AI" OR automation) -is:retweet' },
        ],
      },
      "token",
      30,
      async () => Response.json(payload),
    );
    expect(result.leads).toHaveLength(1);
  });
});
