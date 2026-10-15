import { describe, expect, it } from "vitest";

import { inspirationSearchUrl } from "./inspiration-search";

describe("inspirationSearchUrl", () => {
  const now = new Date("2026-10-15T08:00:00.000Z");

  it("combines grouped keywords with an exact author and a server-side day range", () => {
    const url = inspirationSearchUrl({
      query: "AI OR agents",
      account: "saphylie",
      mediaOnly: true,
      period: "day",
      now,
    });
    expect(url.searchParams.get("query")).toBe(
      "(AI OR agents) from:saphylie has:media",
    );
    expect(url.searchParams.get("start_time")).toBe("2026-10-14T08:00:00.000Z");
  });

  it("uses the whole recent-search window for a week", () => {
    const url = inspirationSearchUrl({
      query: "AI",
      mediaOnly: false,
      period: "week",
      now,
    });
    expect(url.searchParams.get("query")).toBe("(AI)");
    expect(url.searchParams.has("start_time")).toBe(false);
  });

  it("carries an opaque pagination token with the same search filters", () => {
    const url = inspirationSearchUrl({
      query: "AI",
      mediaOnly: true,
      period: "day",
      account: "saphylie",
      now,
      paginationToken: "next+/=",
    });
    expect(url.searchParams.get("pagination_token")).toBe("next+/=");
    expect(url.searchParams.get("query")).toBe("(AI) from:saphylie has:media");
    expect(url.searchParams.get("start_time")).toBe("2026-10-14T08:00:00.000Z");
  });
});
