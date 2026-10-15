export function styleGuideFromPosts(posts: string[]): string | null {
  const samples = posts.map((post) => post.trim()).filter(Boolean);
  if (samples.length < 3) return null;

  const count = samples.length;
  const averageLength = Math.round(
    samples.reduce((sum, post) => sum + [...post].length, 0) / count,
  );
  const chinese = samples.filter((post) =>
    /[\u3400-\u9fff]/u.test(post),
  ).length;
  const questions = samples.filter((post) => /[?？]/u.test(post)).length;
  const lists = samples.filter((post) =>
    /(?:^|\n)\s*(?:\d+[.、]|[-•])\s/mu.test(post),
  ).length;
  const hashtags = samples.filter((post) =>
    /(^|\s)#[\p{L}\p{N}_]+/u.test(post),
  ).length;
  const links = samples.filter((post) => /https?:\/\//u.test(post)).length;
  const emoji = samples.filter((post) =>
    /\p{Extended_Pictographic}/u.test(post),
  ).length;

  return [
    `基于最近 ${count} 条原创帖子统计；这是一份可编辑的写作观察，不是 AI 对受众或个人声音的判断。`,
    `语言：${chinese >= count * 0.7 ? "主要使用中文" : chinese <= count * 0.3 ? "主要使用非中文" : "中英文混合"}。平均每帖约 ${averageLength} 个字符。`,
    `表达习惯：${questions} 条使用问句，${lists} 条使用列表，${hashtags} 条使用话题标签，${emoji} 条使用表情，${links} 条包含链接。`,
    "可在此基础上补充你希望保留的词汇、语气和禁用表达；手动修改会覆盖这份建议。",
  ].join("\n");
}
