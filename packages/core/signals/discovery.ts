import type { Agent, Lead, Person, Signal } from "./types.js";

const STOP_WORDS = new Set([
  "正在",
  "寻找",
  "关注",
  "以及",
  "一个",
  "工具",
  "团队",
  "产品",
  "或者",
  "的",
  "和",
  "与",
  "做",
  "为",
  "ai",
]);

function tokens(text: string): string[] {
  const lower = text.toLocaleLowerCase();
  const latin = lower.match(/[a-z][a-z0-9]{1,}/g) ?? [];
  const han = lower.match(/[\p{Script=Han}]{2,}/gu) ?? [];
  const phrases = han.flatMap((part) =>
    part.length <= 4
      ? [part]
      : Array.from({ length: part.length - 1 }, (_, i) => part.slice(i, i + 2)),
  );
  return [
    ...new Set([...latin, ...phrases].filter((word) => !STOP_WORDS.has(word))),
  ];
}

function signalMatch(
  signal: Signal,
  person: Person,
): { source: string; interaction: string } | null {
  const value = signal.value.toLocaleLowerCase();
  const observed = person.observedSignals?.find(
    (item) =>
      item.type === signal.type && item.value.toLocaleLowerCase() === value,
  );
  if (observed)
    return {
      source: observed.postText,
      interaction:
        signal.type === "keyword"
          ? "命中 X 搜索条件"
          : signal.type === "profile_watch"
            ? "关注账号发布的帖子"
            : "来自公开 X 列表的帖子",
    };
  if (signal.type === "keyword") {
    const post = person.posts.find((item) =>
      item.toLocaleLowerCase().includes(value),
    );
    return post ? { source: post, interaction: "发布含关键词的帖子" } : null;
  }
  if (signal.type === "profile_watch") {
    return person.username.toLocaleLowerCase() === value.replace(/^@/, "")
      ? {
          source: person.posts[0] ?? person.bio,
          interaction: "关注账号发布的帖子",
        }
      : null;
  }
  return person.lists.some((item) => item.toLocaleLowerCase() === value)
    ? { source: signal.value, interaction: "属于关注列表" }
    : null;
}

export function discover(
  agent: Agent,
  existing: Lead[],
  people: Person[],
  now: string,
): { leads: Lead[]; added: number; checkedAt: string | null } {
  if (agent.status === "paused")
    return { leads: existing, added: 0, checkedAt: null };
  const seen = new Set(
    existing
      .filter((lead) => lead.agentId === agent.id)
      .map((lead) => lead.person.id),
  );
  const words = tokens(agent.icpDescription);
  const additions: Lead[] = [];
  for (const person of people) {
    if (seen.has(person.id)) continue;
    const matched = agent.signals
      .map((signal) => ({ signal, hit: signalMatch(signal, person) }))
      .filter((item) => item.hit);
    if (!matched.length) continue;
    const profile =
      `${person.bio} ${person.posts.join(" ")}`.toLocaleLowerCase();
    const overlaps = words.filter((word) => profile.includes(word));
    const score = Math.min(
      100,
      25 +
        Math.min(45, overlaps.length * 9) +
        Math.min(20, matched.length * 10) +
        (person.posts.some((post) =>
          /寻找|比较|推荐|评估|想找|正在研究/.test(post),
        )
          ? 10
          : 0),
    );
    if (score < (agent.precisionMode === "high" ? 80 : 45)) continue;
    const first = matched[0];
    const rationale = overlaps.length
      ? `画像相关：${overlaps.slice(0, 3).join("、")}；命中 ${matched.length} 个监测信号。`
      : `命中 ${matched.length} 个监测信号；画像文本匹配较弱。`;
    additions.push({
      id: `${agent.id}:${person.id}`,
      agentId: agent.id,
      person,
      score,
      rationale,
      provenance: {
        signalType: first.signal.type,
        source: first.hit!.source,
        interaction: first.hit!.interaction,
      },
      discoveredAt: now,
      feedback: "pending",
    });
    seen.add(person.id);
  }
  additions.sort(
    (a, b) =>
      b.score - a.score ||
      a.person.displayName.localeCompare(b.person.displayName),
  );
  return {
    leads: [...existing, ...additions],
    added: additions.length,
    checkedAt: now,
  };
}
