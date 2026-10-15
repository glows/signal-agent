export type AnalyticsPost = {
  id: string;
  text: string;
  createdAt: string | null;
  kind: "post" | "reply" | "repost" | "quote";
  likes: number;
  replies: number;
  reposts: number;
  impressions: number | null;
};

export type AnalyticsTab = "posts" | "replies" | "reposts" | "best" | "engaged";

export function selectAnalyticsPosts(
  posts: AnalyticsPost[],
  tab: AnalyticsTab,
) {
  const filtered = posts.filter((post) => {
    if (tab === "replies") return post.kind === "reply";
    if (tab === "reposts") return post.kind === "repost";
    if (tab === "posts") return post.kind === "post" || post.kind === "quote";
    return true;
  });
  return [...filtered].sort((a, b) => {
    if (tab === "best") return b.likes - a.likes;
    if (tab === "engaged")
      return (
        b.likes + b.replies + b.reposts - (a.likes + a.replies + a.reposts)
      );
    return Date.parse(b.createdAt ?? "") - Date.parse(a.createdAt ?? "");
  });
}

function csvCell(value: string | number | null) {
  let text = String(value ?? "");
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function analyticsPostsCsv(posts: AnalyticsPost[]) {
  const columns = [
    "Date",
    "Type",
    "Post",
    "Likes",
    "Replies",
    "Reposts",
    "Views",
    "URL",
  ];
  const rows = posts.map((post) => [
    post.createdAt,
    post.kind,
    post.text,
    post.likes,
    post.replies,
    post.reposts,
    post.impressions,
    `https://x.com/i/status/${post.id}`,
  ]);
  return `\uFEFF${[columns, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
}
