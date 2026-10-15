import { describe, expect, it } from "vitest";

import {
  analyticsPostsCsv,
  selectAnalyticsPosts,
  type AnalyticsPost,
} from "./analytics";

const posts: AnalyticsPost[] = [
  {
    id: "1",
    text: "ordinary",
    createdAt: "2026-10-01T00:00:00Z",
    kind: "post",
    likes: 2,
    replies: 0,
    reposts: 0,
    impressions: 10,
  },
  {
    id: "2",
    text: "reply",
    createdAt: "2026-10-03T00:00:00Z",
    kind: "reply",
    likes: 1,
    replies: 10,
    reposts: 0,
    impressions: null,
  },
  {
    id: "3",
    text: "popular",
    createdAt: "2026-10-02T00:00:00Z",
    kind: "repost",
    likes: 20,
    replies: 0,
    reposts: 0,
    impressions: 30,
  },
];

describe("analytics post views", () => {
  it("separates post types and sorts engagement views", () => {
    expect(selectAnalyticsPosts(posts, "posts").map((post) => post.id)).toEqual(
      ["1"],
    );
    expect(
      selectAnalyticsPosts(posts, "replies").map((post) => post.id),
    ).toEqual(["2"]);
    expect(
      selectAnalyticsPosts(posts, "reposts").map((post) => post.id),
    ).toEqual(["3"]);
    expect(
      selectAnalyticsPosts(posts, "engaged").map((post) => post.id),
    ).toEqual(["3", "2", "1"]);
  });

  it("escapes CSV content and neutralizes spreadsheet formulas", () => {
    const csv = analyticsPostsCsv([
      { ...posts[0]!, text: '=HYPERLINK("bad")\nnext' },
    ]);
    expect(csv).toContain('"\'=HYPERLINK(""bad"")\nnext"');
    expect(csv.startsWith("\uFEFF")).toBe(true);
  });
});
