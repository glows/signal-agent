import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchXTimeline } from "./x-analytics";

afterEach(() => vi.restoreAllMocks());

describe("X timeline pagination", () => {
  it("passes the opaque cursor and maps posts with a next cursor", async () => {
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              id: "p1",
              text: "hello",
              created_at: "2026-10-01T00:00:00Z",
              referenced_tweets: [{ type: "replied_to" }],
              public_metrics: {
                like_count: 2,
                reply_count: 3,
                repost_count: 4,
                impression_count: 5,
              },
            },
          ],
          meta: { next_token: "next+/=" },
        }),
        { status: 200 },
      ),
    );
    const page = await fetchXTimeline("user-id", "access-token", "old+/=");
    const url = new URL(String(request.mock.calls[0]?.[0]));
    expect(url.searchParams.get("pagination_token")).toBe("old+/=");
    expect(url.searchParams.get("max_results")).toBe("30");
    expect(page).toEqual({
      nextToken: "next+/=",
      posts: [
        {
          id: "p1",
          text: "hello",
          createdAt: "2026-10-01T00:00:00Z",
          kind: "reply",
          likes: 2,
          replies: 3,
          reposts: 4,
          impressions: 5,
        },
      ],
    });
  });

  it("ends pagination when X supplies no next token", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ meta: {} }), { status: 200 }),
    );
    expect(await fetchXTimeline("user-id", "access-token")).toEqual({
      posts: [],
      nextToken: null,
    });
  });
});
