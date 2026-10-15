export function inspirationSearchUrl(input: {
  query: string;
  mediaOnly: boolean;
  account?: string;
  period: "day" | "week";
  now: Date;
  paginationToken?: string;
}): URL {
  const url = new URL("https://api.x.com/2/tweets/search/recent");
  const terms = [`(${input.query})`];
  if (input.account) terms.push(`from:${input.account}`);
  if (input.mediaOnly) terms.push("has:media");
  url.searchParams.set("query", terms.join(" "));
  if (input.period === "day")
    url.searchParams.set(
      "start_time",
      new Date(input.now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
    );
  url.searchParams.set("max_results", "30");
  if (input.paginationToken)
    url.searchParams.set("pagination_token", input.paginationToken);
  url.searchParams.set("expansions", "author_id,attachments.media_keys");
  url.searchParams.set("tweet.fields", "created_at,public_metrics,attachments");
  url.searchParams.set("user.fields", "name,username");
  url.searchParams.set("media.fields", "type,url,preview_image_url");
  return url;
}
