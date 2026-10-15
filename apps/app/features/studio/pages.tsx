import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { useSessionQuery } from "#lib/queries/session";
import { signalConnectionQueryOptions } from "#lib/queries/signals";
import { trpcClient } from "#lib/trpc";

import {
  analyticsPostsCsv,
  selectAnalyticsPosts,
  type AnalyticsTab,
} from "./analytics";
import {
  formatZonedDate,
  formatZonedInput,
  parseZonedInput,
  upcomingQueueSlots,
} from "./schedule";
import {
  newId,
  useStudio,
  type StudioData,
  type StudioPost,
  type StudioWorker,
} from "./store";
import { styleGuideFromPosts } from "./style-guide";
import { applyWritingRules } from "./writing-rules";

import "./studio.css";

function useWorkspace() {
  const { data: session } = useSessionQuery();
  return useStudio(session?.user.id ?? "");
}

function Page({
  title,
  subtitle,
  children,
  actions,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="studio-page">
      <header className="studio-heading">
        <div>
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {actions}
      </header>
      {children}
    </div>
  );
}

function Alert({ text }: { text: string }) {
  return text ? (
    <p className="studio-alert" role="alert">
      {text}
    </p>
  ) : null;
}

export function HomePage() {
  const { data } = useWorkspace();
  const review = data.posts.filter((post) => post.status === "review").length;
  const scheduled = data.posts.filter(
    (post) => post.status === "scheduled",
  ).length;
  return (
    <Page title="Home" subtitle="你的内容和获客工作台。">
      <div className="studio-stats">
        <Link to="/workers" className="studio-stat">
          <strong>{review}</strong>
          <span>待审核的 Worker 草稿</span>
        </Link>
        <Link to="/queue" className="studio-stat">
          <strong>{scheduled}</strong>
          <span>已排期的帖子</span>
        </Link>
        <Link to="/contacts" className="studio-stat">
          <strong>{data.contacts.length}</strong>
          <span>联系人</span>
        </Link>
      </div>
      <div className="studio-grid-2">
        <section className="studio-card">
          <h2>写下一篇帖子</h2>
          <p>从想法开始，保存草稿或加入发布队列。</p>
          <Link className="studio-primary" to="/compose">
            Create a post
          </Link>
        </section>
        <section className="studio-card">
          <h2>查看新的线索</h2>
          <p>从 X 监测来源寻找与你的产品相关的人。</p>
          <Link className="studio-secondary" to="/signals">
            打开 Signals
          </Link>
        </section>
      </div>
    </Page>
  );
}

export function ComposePage() {
  const { data, update, error } = useWorkspace();
  const [text, setText] = useState("");
  const [schedule, setSchedule] = useState("");
  const [notice, setNotice] = useState("");
  function save(status: "draft" | "scheduled") {
    if (!text.trim()) return setNotice("先输入帖子内容。");
    if (text.length > 280)
      return setNotice("当前 X 发布接口最多接受 280 个字符，请缩短内容。");
    const scheduledAt =
      status === "scheduled" ? parseZonedInput(schedule, data.timezone) : null;
    if (
      status === "scheduled" &&
      (!scheduledAt || new Date(scheduledAt).getTime() <= Date.now())
    )
      return setNotice("请选择未来的发布时间。");
    const post: StudioPost = {
      id: newId(),
      text: text.trim(),
      status,
      createdAt: new Date().toISOString(),
      ...(scheduledAt ? { scheduledAt } : {}),
    };
    if (
      update((current) => ({ ...current, posts: [post, ...current.posts] }))
    ) {
      setText("");
      setSchedule("");
      setNotice(
        status === "scheduled"
          ? "已加入队列。到时需要你在队列中确认发布。"
          : "草稿已保存。",
      );
    }
  }
  return (
    <Page
      title="Create a post"
      subtitle="写作、预览，然后保存草稿或安排发布时间。"
    >
      <div className="studio-grid-2">
        <section className="studio-card">
          <label htmlFor="post-text">帖子内容</label>
          <textarea
            id="post-text"
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={10}
            maxLength={280}
            placeholder="分享一个想法…"
          />
          <small>{text.length}/280 字符</small>
          <label htmlFor="post-time">发布时间 · {data.timezone}</label>
          <input
            id="post-time"
            type="datetime-local"
            value={schedule}
            onChange={(event) => setSchedule(event.target.value)}
          />
          <div className="studio-actions">
            <button className="studio-secondary" onClick={() => save("draft")}>
              保存草稿
            </button>
            <button
              className="studio-primary"
              onClick={() => save("scheduled")}
            >
              加入队列
            </button>
          </div>
          <Alert text={notice || error} />
        </section>
        <section className="studio-card">
          <h2>预览</h2>
          <div className="studio-post-preview">
            <strong>你的 X 帖子</strong>
            <p>{text || "你的内容会显示在这里…"}</p>
          </div>
          <p className="studio-muted">
            排期内容保存在当前浏览器。发布前需要由你确认。
          </p>
        </section>
      </div>
    </Page>
  );
}

export function QueuePage() {
  const { data, update, error } = useWorkspace();
  const [editing, setEditing] = useState<string | null>(null);
  const [when, setWhen] = useState("");
  const [publishing, setPublishing] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [activeSlot, setActiveSlot] = useState<string | null>(null);
  const [slotText, setSlotText] = useState("");
  const [slotDraftId, setSlotDraftId] = useState("");
  const [slotAsOf] = useState(() => new Date());
  const scheduled = data.posts
    .filter((post) => post.status === "scheduled")
    .sort((a, b) => (a.scheduledAt ?? "").localeCompare(b.scheduledAt ?? ""));
  const drafts = data.posts.filter((post) => post.status === "draft");
  const published = data.posts.filter((post) => post.status === "published");
  const slots = upcomingQueueSlots(slotAsOf, data.timezone);
  function fillSlot(slot: string, now: number) {
    if (Date.parse(slot) <= now)
      return setNotice("这个时间槽已过去，请选择未来时间。");
    if (scheduled.some((post) => post.scheduledAt === slot))
      return setNotice("这个时间槽已排期，请选择其他时间。");
    if (slotDraftId) {
      const draft = drafts.find((post) => post.id === slotDraftId);
      if (!draft) return setNotice("所选草稿已不存在。");
      if (
        !update((current) => ({
          ...current,
          posts: current.posts.map((post) =>
            post.id === draft.id
              ? { ...post, status: "scheduled", scheduledAt: slot }
              : post,
          ),
        }))
      )
        return setNotice("排期保存失败，请重试。");
    } else {
      const text = slotText.trim();
      if (!text || text.length > 280)
        return setNotice("请输入 1 至 280 字的帖子内容。");
      const post: StudioPost = {
        id: newId(),
        text,
        status: "scheduled",
        createdAt: new Date().toISOString(),
        scheduledAt: slot,
      };
      if (
        !update((current) => ({ ...current, posts: [post, ...current.posts] }))
      )
        return setNotice("排期保存失败，请重试。");
    }
    setActiveSlot(null);
    setSlotText("");
    setSlotDraftId("");
    setNotice("已加入队列；到时请在下方确认发布。");
  }
  function change(id: string, patch: Partial<StudioPost>) {
    update((current) => ({
      ...current,
      posts: current.posts.map((post) =>
        post.id === id ? { ...post, ...patch } : post,
      ),
    }));
  }
  function remove(id: string) {
    update((current) => ({
      ...current,
      posts: current.posts.filter((post) => post.id !== id),
    }));
  }
  async function publish(post: StudioPost) {
    if (
      !window.confirm(
        `确认现在通过已连接的 X 账号发布这篇帖子？\n\n${post.text}`,
      )
    )
      return;
    setPublishing(post.id);
    setNotice("");
    try {
      const result = await trpcClient.signals.publish.mutate({
        text: post.text,
      });
      if (
        update((current) => ({
          ...current,
          posts: current.posts.map((item) =>
            item.id === post.id
              ? { ...item, status: "published", xPostUrl: result.url }
              : item,
          ),
        }))
      )
        setNotice("已发布到 X。");
      else setNotice(`已发布到 X，但浏览器未保存发布记录：${result.url}`);
    } catch (cause) {
      setNotice(
        cause instanceof Error
          ? cause.message
          : "发布失败，请到 X 账号确认状态。",
      );
    } finally {
      setPublishing(null);
    }
  }
  return (
    <Page
      title="My queue"
      subtitle="查看排期、改期和管理草稿。"
      actions={
        <Link className="studio-primary" to="/compose">
          + Create a post
        </Link>
      }
    >
      <section className="studio-card">
        <h2>未来 5 个发布时间槽</h2>
        <p className="studio-muted">
          以 {data.timezone} 每天 18:00 展示。选择空槽，可写新帖或放入已有草稿。
        </p>
        <div className="studio-queue-slots">
          {slots.map((slot) => {
            const existing = scheduled.find(
              (post) => post.scheduledAt === slot,
            );
            return (
              <div className="studio-queue-slot" key={slot}>
                <strong>{formatZonedDate(slot, data.timezone)}</strong>
                {existing ? (
                  <p>{existing.text}</p>
                ) : (
                  <button
                    className="studio-link"
                    onClick={() => {
                      setActiveSlot(slot);
                      setSlotDraftId("");
                      setSlotText("");
                    }}
                  >
                    + 填入时间槽
                  </button>
                )}
                {activeSlot === slot && !existing && (
                  <div className="studio-slot-form">
                    <label htmlFor="slot-draft">使用已有草稿</label>
                    <select
                      id="slot-draft"
                      value={slotDraftId}
                      onChange={(event) => setSlotDraftId(event.target.value)}
                    >
                      <option value="">写一篇新帖</option>
                      {drafts.map((draft) => (
                        <option key={draft.id} value={draft.id}>
                          {draft.text.slice(0, 60)}
                        </option>
                      ))}
                    </select>
                    {!slotDraftId && (
                      <textarea
                        aria-label="新帖内容"
                        value={slotText}
                        maxLength={280}
                        rows={3}
                        onChange={(event) => setSlotText(event.target.value)}
                        placeholder="分享一个想法…"
                      />
                    )}
                    <div className="studio-inline">
                      <button
                        className="studio-primary"
                        onClick={() => fillSlot(slot, Date.now())}
                      >
                        加入队列
                      </button>
                      <button
                        className="studio-link"
                        onClick={() => setActiveSlot(null)}
                      >
                        取消
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
      <section className="studio-card">
        <h2>已排期 · {scheduled.length}</h2>
        <p className="studio-muted">
          到达排期时间后，请在这里确认发布。当前不会自动发布。
        </p>
        {scheduled.length === 0 && (
          <p className="studio-muted">还没有已排期的帖子。</p>
        )}
        {scheduled.map((post) => (
          <article className="studio-row" key={post.id}>
            <div>
              <strong>
                {post.scheduledAt
                  ? formatZonedDate(post.scheduledAt, data.timezone)
                  : "待选时间"}{" "}
                · {data.timezone}
              </strong>
              <p>{post.text}</p>
              {editing === post.id && (
                <div className="studio-inline">
                  <input
                    aria-label="新的发布时间"
                    type="datetime-local"
                    value={when}
                    onChange={(event) => setWhen(event.target.value)}
                  />
                  <button
                    className="studio-primary"
                    onClick={() => {
                      const scheduledAt = parseZonedInput(when, data.timezone);
                      if (
                        scheduledAt &&
                        new Date(scheduledAt).getTime() > Date.now()
                      ) {
                        change(post.id, {
                          scheduledAt,
                        });
                        setEditing(null);
                      } else setNotice("请选择该时区中有效的未来时间。");
                    }}
                  >
                    保存
                  </button>
                </div>
              )}
            </div>
            <div className="studio-inline">
              <button
                className="studio-primary"
                disabled={publishing === post.id}
                onClick={() => void publish(post)}
              >
                {publishing === post.id ? "发布中…" : "现在发布"}
              </button>
              <button
                className="studio-link"
                onClick={() => {
                  setEditing(post.id);
                  setWhen(
                    post.scheduledAt
                      ? formatZonedInput(post.scheduledAt, data.timezone)
                      : "",
                  );
                }}
              >
                改期
              </button>
              <button
                className="studio-link"
                onClick={() =>
                  change(post.id, { status: "draft", scheduledAt: undefined })
                }
              >
                移到草稿
              </button>
              <button
                className="studio-link danger"
                onClick={() => remove(post.id)}
              >
                删除
              </button>
            </div>
          </article>
        ))}
      </section>
      <section className="studio-card">
        <h2>草稿 · {drafts.length}</h2>
        {drafts.length === 0 && <p className="studio-muted">还没有草稿。</p>}
        {drafts.map((post) => (
          <article className="studio-row" key={post.id}>
            <p>{post.text}</p>
            <div className="studio-inline">
              <button
                className="studio-link"
                onClick={() => {
                  const next = window.prompt("编辑草稿", post.text);
                  if (next?.trim() && next.trim().length <= 280)
                    change(post.id, { text: next.trim() });
                  else if (next && next.trim().length > 280)
                    setNotice("帖子最多 280 字符。");
                }}
              >
                编辑
              </button>
              <button
                className="studio-link"
                onClick={() => {
                  setEditing(post.id);
                  setWhen("");
                }}
              >
                加入队列
              </button>
              <button
                className="studio-link danger"
                onClick={() => remove(post.id)}
              >
                删除
              </button>
            </div>
            {editing === post.id && (
              <div className="studio-inline">
                <input
                  aria-label="草稿发布时间"
                  type="datetime-local"
                  value={when}
                  onChange={(event) => setWhen(event.target.value)}
                />
                <button
                  className="studio-primary"
                  onClick={() => {
                    const scheduledAt = parseZonedInput(when, data.timezone);
                    if (
                      scheduledAt &&
                      new Date(scheduledAt).getTime() > Date.now()
                    ) {
                      change(post.id, {
                        status: "scheduled",
                        scheduledAt,
                      });
                      setEditing(null);
                    } else setNotice("请选择该时区中有效的未来时间。");
                  }}
                >
                  确认排期
                </button>
              </div>
            )}
          </article>
        ))}
      </section>
      <section className="studio-card">
        <h2>已发布 · {published.length}</h2>
        {published.length === 0 && (
          <p className="studio-muted">暂无已发布的帖子。</p>
        )}
        {published.map((post) => (
          <article className="studio-row" key={post.id}>
            <p>{post.text}</p>
            {post.xPostUrl && (
              <a href={post.xPostUrl} target="_blank" rel="noreferrer">
                View on X ↗
              </a>
            )}
          </article>
        ))}
      </section>
      <Alert text={notice || error} />
    </Page>
  );
}

function makeDrafts(worker: StudioWorker, context: StudioData): StudioPost[] {
  const topic =
    worker.topic || context.products[0] || context.about || "你正在研究的领域";
  const audience = context.audience || "关注这个话题的人";
  const personalPatterns = [
    `${topic}：最近我反复想到一个问题。\n\n${audience}真正需要解决的，可能不是更多工具，而是更清楚地判断下一步。你怎么看？`,
    `关于${topic}，我现在的做法是：\n\n1. 先确认真实需求\n2. 找到可以验证的证据\n3. 再决定是否投入\n\n哪一步对你最难？`,
    `一个关于${topic}的观察：很多讨论停在结论，真正有用的是把过程和取舍讲清楚。\n\n我会继续记录实践中的例子。`,
  ];
  const creatorPatterns = [
    `如果你正在关注${topic}，先看这三个信号：\n\n1. 需求是否反复出现\n2. 谁愿意为解决方案付费\n3. 有没有可验证的结果\n\n你会先看哪一个？`,
    `${topic}的一个常见误区：先追求完整方案，再寻找真正的用户。\n\n更好的顺序是从一个具体问题和一次真实反馈开始。`,
    `关于${topic}，我会问三个问题：\n\n谁遇到问题？现在怎么解决？什么证据能证明新方法更好？`,
  ];
  const hybridPatterns = personalPatterns.map(
    (item, index) => `${item}\n\n${creatorPatterns[index].split("\n\n")[0]}`,
  );
  const patterns =
    worker.voice === "creator"
      ? creatorPatterns
      : worker.voice === "hybrid"
        ? hybridPatterns
        : personalPatterns;
  const brief = [
    `主题：${topic}`,
    `受众：${audience}`,
    `声音模式：${worker.voice === "mine" ? "个人观点模板" : worker.voice === "creator" ? "创作者结构模板" : "混合模板"}`,
    context.vocabulary ? `风格指南：${context.vocabulary}` : "",
    worker.instructions ? `额外要求：${worker.instructions}` : "",
    context.writingRules.noQuestions ? "账号规则：文末不提问" : "",
    context.writingRules.noNumberedLists ? "账号规则：不使用编号列表" : "",
  ]
    .filter(Boolean)
    .join("\n");
  return Array.from({ length: worker.count }, (_, i) => ({
    id: newId(),
    text: applyWritingRules(
      patterns[i % patterns.length],
      context.writingRules,
    ),
    status: "review" as const,
    createdAt: new Date().toISOString(),
    workerId: worker.id,
    reviewBrief: brief,
  }));
}

export function WorkersPage() {
  const { data, update, error } = useWorkspace();
  const [editing, setEditing] = useState<StudioWorker | null>(null);
  const [notice, setNotice] = useState("");
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [voiceCandidates, setVoiceCandidates] = useState<string[]>([]);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [voiceNotice, setVoiceNotice] = useState("");
  const [reviewWhen, setReviewWhen] = useState<Record<string, string>>({});
  const review = data.posts.filter((post) => post.status === "review");
  function openWorkerEditor(worker: StudioWorker) {
    setEditing(worker);
    setVoiceCandidates(worker.voiceExamples ?? []);
    setVoiceNotice("");
  }
  async function loadVoiceSamples() {
    setVoiceLoading(true);
    setVoiceNotice("");
    try {
      const posts = await trpcClient.signals.recentOwnPosts.mutate();
      const candidates = [...new Set(posts.map((post) => post.trim()))]
        .filter((post) => post.length > 0 && post.length <= 280)
        .slice(0, 30);
      setVoiceCandidates((current) => [
        ...new Set([
          ...(editing?.voiceExamples ?? []),
          ...candidates,
          ...current,
        ]),
      ]);
      setVoiceNotice(
        candidates.length
          ? `读取到 ${candidates.length} 条近期原创帖子，请选择最多 5 条作为写作样本。`
          : "没有找到长度不超过 280 字的近期原创帖子。",
      );
    } catch (cause) {
      setVoiceNotice(
        cause instanceof Error ? cause.message : "读取 X 帖子失败。",
      );
    } finally {
      setVoiceLoading(false);
    }
  }
  async function generateWithAi(worker: StudioWorker) {
    if (!worker.active) return setNotice("请先启用这个 Worker。");
    if (generatingId) return;
    setGeneratingId(worker.id);
    setNotice("");
    try {
      const result = await trpcClient.studio.generateWorker.mutate({
        topic: (
          worker.topic ||
          data.products[0] ||
          data.about ||
          "我的专业领域"
        ).slice(0, 200),
        audience: data.audience,
        about: data.about,
        styleGuide: data.vocabulary,
        instructions: worker.instructions,
        voice: worker.voice,
        count: worker.count,
        noQuestions: data.writingRules.noQuestions,
        noNumberedLists: data.writingRules.noNumberedLists,
        examples:
          worker.voice === "creator"
            ? []
            : worker.voiceExamples?.length
              ? worker.voiceExamples
              : data.posts
                  .filter((post) => post.status === "published")
                  .map((post) => post.text.trim())
                  .filter((text) => text.length > 0 && text.length <= 280)
                  .slice(0, 5),
      });
      const createdAt = new Date().toISOString();
      const posts: StudioPost[] = result.drafts.map((text) => ({
        id: newId(),
        text: applyWritingRules(text, data.writingRules),
        status: "review",
        createdAt,
        workerId: worker.id,
        reviewBrief: `AI 生成 · 主题：${worker.topic || data.products[0] || "我的专业领域"}\n声音：${worker.voice}\n额外要求：${worker.instructions || "无"}`,
      }));
      if (posts.some((post) => !post.text))
        throw new Error("AI 草稿应用账号规则后为空，请调整规则或重试。");
      if (
        update((current) => ({
          ...current,
          posts: [...posts, ...current.posts],
        }))
      )
        setNotice(`AI 已生成 ${posts.length} 篇，请逐篇审核。`);
      else setNotice("AI 已生成草稿，但保存失败，请重试。");
    } catch (cause) {
      setNotice(
        cause instanceof Error ? cause.message : "AI 生成失败，请重试。",
      );
    } finally {
      setGeneratingId(null);
    }
  }
  function saveWorker() {
    if (!editing?.name.trim()) return setNotice("请输入 Worker 名称。");
    const worker = editing;
    if (
      !update((current) => ({
        ...current,
        workers: current.workers.some((item) => item.id === worker.id)
          ? current.workers.map((item) =>
              item.id === worker.id ? worker : item,
            )
          : [...current.workers, worker],
      }))
    )
      return setNotice("保存 Worker 失败，请重试。");
    setEditing(null);
    setNotice("");
  }
  function setPost(id: string, status: "draft" | "scheduled" | "dismiss") {
    const post = data.posts.find((item) => item.id === id);
    if (!post) return;
    if (status !== "dismiss" && (!post.text.trim() || post.text.length > 280)) {
      setNotice("请先把草稿修改为 1–280 个字符，再批准。");
      return;
    }
    const scheduledAt =
      status === "scheduled"
        ? parseZonedInput(reviewWhen[id] ?? "", data.timezone)
        : null;
    if (
      status === "scheduled" &&
      (!scheduledAt || new Date(scheduledAt).getTime() <= Date.now())
    ) {
      setNotice("请选择该时区中有效的未来发布时间。");
      return;
    }
    update((current) => ({
      ...current,
      posts:
        status === "dismiss"
          ? current.posts.filter((item) => item.id !== id)
          : current.posts.map((item) =>
              item.id === id
                ? {
                    ...item,
                    status,
                    ...(scheduledAt ? { scheduledAt } : {}),
                  }
                : item,
            ),
    }));
    setNotice(
      status === "dismiss"
        ? "已驳回草稿。"
        : status === "draft"
          ? "已保存到草稿。"
          : "已加入队列，到时仍需手动确认发布。",
    );
  }
  return (
    <Page
      title="Workers"
      subtitle="配置写作 Worker，生成后逐篇审核。"
      actions={
        <div className="studio-inline">
          <button
            className="studio-secondary"
            onClick={() =>
              openWorkerEditor({
                id: newId(),
                name: "Daily posts",
                topic: data.products[0] ?? "",
                voice: "mine",
                instructions: "",
                count: 3,
                active: true,
              })
            }
          >
            Start with a ready-made worker
          </button>
          <button
            className="studio-primary"
            onClick={() =>
              openWorkerEditor({
                id: newId(),
                name: "Daily posts",
                topic: "",
                voice: "mine",
                instructions: "",
                count: 3,
                active: true,
              })
            }
          >
            + Build your own
          </button>
        </div>
      }
    >
      <section className="studio-card studio-intro">
        <h2>Put your content on autopilot</h2>
        <p>
          Worker 根据你的主题生成一批可编辑草稿。每篇都由你决定是否保存或排期。
        </p>
        <p className="studio-muted">
          可选择 AI 生成或本地模板。AI 生成会消耗 Cloudflare Workers AI
          用量；所有结果都需要人工审核，不会自动发布。
        </p>
      </section>
      <section className="studio-card">
        <h2>Your workers · {data.workers.length}</h2>
        {data.workers.length === 0 && (
          <p className="studio-muted">还没有 Worker。创建一个开始生成草稿。</p>
        )}
        {data.workers.map((worker) => (
          <article className="studio-row" key={worker.id}>
            <div>
              <strong>{worker.name}</strong>
              <p>
                {worker.voice === "mine"
                  ? "My voice"
                  : worker.voice === "creator"
                    ? "Creator style"
                    : "Hybrid"}{" "}
                · {worker.topic || "你的主题"} · 每次 {worker.count} 篇
              </p>
            </div>
            <div className="studio-inline">
              <button
                className="studio-primary"
                disabled={Boolean(generatingId)}
                onClick={() => void generateWithAi(worker)}
              >
                {generatingId === worker.id ? "AI 生成中…" : "AI 生成"}
              </button>
              <button
                className="studio-secondary"
                onClick={() => {
                  if (!worker.active)
                    return setNotice("请先启用这个 Worker。 ");
                  update((current) => ({
                    ...current,
                    posts: [...makeDrafts(worker, current), ...current.posts],
                  }));
                  setNotice("草稿已生成，请逐篇审核。");
                }}
              >
                使用模板
              </button>
              <button
                className="studio-link"
                onClick={() =>
                  update((current) => ({
                    ...current,
                    workers: current.workers.map((item) =>
                      item.id === worker.id
                        ? { ...item, active: !item.active }
                        : item,
                    ),
                  }))
                }
              >
                {worker.active ? "暂停" : "启用"}
              </button>
              <button
                className="studio-link"
                onClick={() => openWorkerEditor(worker)}
              >
                编辑
              </button>
              <button
                className="studio-link danger"
                onClick={() =>
                  update((current) => ({
                    ...current,
                    workers: current.workers.filter(
                      (item) => item.id !== worker.id,
                    ),
                  }))
                }
              >
                删除
              </button>
            </div>
          </article>
        ))}
      </section>
      <section className="studio-card">
        <h2>待审核 · {review.length}</h2>
        {review.length === 0 && (
          <p className="studio-muted">运行 Worker 后，草稿会出现在这里。</p>
        )}
        {review.map((post) => (
          <article className="studio-review" key={post.id}>
            {post.reviewBrief && (
              <details>
                <summary>本篇写作简报与额外要求</summary>
                <pre className="studio-brief">{post.reviewBrief}</pre>
              </details>
            )}
            <textarea
              aria-label="编辑 Worker 草稿"
              value={post.text}
              onChange={(event) =>
                update((current) => ({
                  ...current,
                  posts: current.posts.map((item) =>
                    item.id === post.id
                      ? { ...item, text: event.target.value }
                      : item,
                  ),
                }))
              }
              rows={5}
              maxLength={280}
            />
            <small>{post.text.length}/280 字符</small>
            <label>
              批准后排期 · {data.timezone}
              <input
                type="datetime-local"
                value={reviewWhen[post.id] ?? ""}
                onChange={(event) =>
                  setReviewWhen((current) => ({
                    ...current,
                    [post.id]: event.target.value,
                  }))
                }
              />
            </label>
            <div className="studio-actions">
              <button
                className="studio-secondary"
                onClick={() => setPost(post.id, "draft")}
              >
                保存为草稿
              </button>
              <button
                className="studio-primary"
                onClick={() => setPost(post.id, "scheduled")}
              >
                批准并排期
              </button>
              <button
                className="studio-link danger"
                onClick={() => setPost(post.id, "dismiss")}
              >
                驳回
              </button>
            </div>
          </article>
        ))}
      </section>
      <Alert text={notice || error} />
      {editing && (
        <div className="studio-modal-backdrop">
          <dialog
            open
            className="studio-modal"
            aria-modal="true"
            aria-label="Edit worker"
          >
            <h2>Edit worker</h2>
            <label>
              名称
              <input
                value={editing.name}
                onChange={(e) =>
                  setEditing({ ...editing, name: e.target.value })
                }
              />
            </label>
            <label>
              主题
              <input
                value={editing.topic}
                maxLength={200}
                onChange={(e) =>
                  setEditing({ ...editing, topic: e.target.value })
                }
              />
            </label>
            <label>
              Voice
              <select
                value={editing.voice}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    voice: e.target.value as StudioWorker["voice"],
                  })
                }
              >
                <option value="mine">My voice</option>
                <option value="creator">Creator style</option>
                <option value="hybrid">Hybrid</option>
              </select>
            </label>
            {editing.voice !== "creator" && (
              <div className="studio-field">
                <strong>我的声音 · 写作样本</strong>
                <p>
                  从已连接的 X 读取近期原创帖子，最多选择 5
                  条。样本与风格指南冲突时以样本为准；账号规则始终优先。
                </p>
                <button
                  className="studio-secondary"
                  disabled={voiceLoading}
                  onClick={() => void loadVoiceSamples()}
                >
                  {voiceLoading ? "读取中…" : "从 X 读取近期原创帖子"}
                </button>
                <p>
                  读取会消耗 X API 额度。已选择{" "}
                  {editing.voiceExamples?.length ?? 0}/5 条。
                </p>
                {voiceNotice && <output>{voiceNotice}</output>}
                {voiceCandidates.map((post) => (
                  <label key={post} className="studio-voice-example">
                    <input
                      type="checkbox"
                      checked={editing.voiceExamples?.includes(post) ?? false}
                      onChange={() => {
                        const selected = editing.voiceExamples ?? [];
                        setEditing({
                          ...editing,
                          voiceExamples: selected.includes(post)
                            ? selected.filter((item) => item !== post)
                            : selected.length < 5
                              ? [...selected, post]
                              : selected,
                        });
                      }}
                    />
                    <span>{post}</span>
                  </label>
                ))}
              </div>
            )}
            <label>
              每次篇数
              <input
                type="number"
                min="1"
                max="6"
                value={editing.count}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    count: Math.max(
                      1,
                      Math.min(6, Number(e.target.value) || 1),
                    ),
                  })
                }
              />
            </label>
            <label>
              额外写作要求
              <textarea
                rows={3}
                maxLength={600}
                value={editing.instructions}
                onChange={(e) =>
                  setEditing({ ...editing, instructions: e.target.value })
                }
              />
            </label>
            <div className="studio-actions">
              <button
                className="studio-secondary"
                onClick={() => setEditing(null)}
              >
                取消
              </button>
              <button className="studio-primary" onClick={saveWorker}>
                保存
              </button>
            </div>
          </dialog>
        </div>
      )}
    </Page>
  );
}

export function InspirationPage() {
  const { data, update, error: storageError } = useWorkspace();
  const { data: session } = useSessionQuery();
  const connection = useQuery(signalConnectionQueryOptions(session?.user.id));
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<
    Awaited<ReturnType<typeof trpcClient.signals.searchPosts.mutate>>
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"posts" | "media" | "saved">("posts");
  const [period, setPeriod] = useState<"day" | "week">("week");
  const [account, setAccount] = useState("");
  const [bookmarkedOnly, setBookmarkedOnly] = useState(false);
  const [notice, setNotice] = useState("");
  const shown = (tab === "saved" ? data.savedInspiration : results).filter(
    (post) => {
      if (tab === "saved") return true;
      return !bookmarkedOnly || data.bookmarkedPostIds.includes(post.id);
    },
  );
  async function search() {
    if (!query.trim()) return setError("请输入搜索关键词。");
    const handle = account.trim();
    if (handle && !/^@?[A-Za-z0-9_]{1,15}$/.test(handle))
      return setError(
        "请输入有效的 X 用户名（最多 15 位字母、数字或下划线）。",
      );
    setLoading(true);
    setError("");
    try {
      const result = await trpcClient.signals.searchPosts.mutate({
        query: query.trim(),
        mediaOnly: tab === "media",
        period,
        ...(handle ? { account: handle } : {}),
      });
      setResults(result);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "搜索失败，请稍后重试。",
      );
      setResults([]);
    } finally {
      setLoading(false);
    }
  }
  return (
    <Page title="Inspiration" subtitle="发现 X 上的近期内容，寻找创作灵感。">
      <div className="studio-tabs">
        <button
          className={tab === "posts" ? "active" : ""}
          onClick={() => {
            setTab("posts");
            setResults([]);
          }}
        >
          Posts
        </button>
        <button
          className={tab === "media" ? "active" : ""}
          onClick={() => {
            setTab("media");
            setResults([]);
          }}
        >
          Media
        </button>
        <button
          className={tab === "saved" ? "active" : ""}
          onClick={() => setTab("saved")}
        >
          Saved · {data.savedInspiration.length}
        </button>
      </div>
      {tab !== "saved" && (
        <div className="studio-search">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void search();
            }}
            placeholder="Search by keyword…"
          />
          <button
            className="studio-primary"
            disabled={loading || !connection.data?.allowed}
            onClick={() => void search()}
          >
            {loading ? "Searching…" : "Search"}
          </button>
        </div>
      )}
      {tab !== "saved" && (
        <div className="studio-inline studio-filters">
          <select
            aria-label="时间范围"
            value={period}
            onChange={(e) => {
              setPeriod(e.target.value as typeof period);
              setResults([]);
            }}
          >
            <option value="day">过去 24 小时</option>
            <option value="week">过去一周</option>
          </select>
          <input
            aria-label="筛选 X 账号"
            value={account}
            onChange={(e) => {
              setAccount(e.target.value);
              setResults([]);
            }}
            placeholder="指定账号 @handle"
          />
          <label className="studio-inline">
            <input
              type="checkbox"
              checked={bookmarkedOnly}
              onChange={(e) => setBookmarkedOnly(e.target.checked)}
            />
            仅收藏
          </label>
        </div>
      )}
      <p className="studio-muted">
        {tab === "saved" ? (
          "收藏的帖子保存在你的账号中，可以从这里重新打开或用于创作。"
        ) : (
          <>
            使用已连接的 X 账号搜索近期{tab === "media" ? "媒体" : "帖子"}
            。每次查询会消耗 X API 额度；时间与账号条件在 X 搜索时生效，最多返回
            30 条。最近 7 天是当前搜索接口的时间上限；“仅收藏”只筛选本次结果。
          </>
        )}
      </p>
      {tab !== "saved" && !connection.data?.allowed && (
        <p className="studio-alert">请先在 Signals 页面连接并授权 X。</p>
      )}
      <Alert text={error || storageError || notice} />
      <div className="studio-masonry">
        {shown.map((post) => (
          <article className="studio-card" key={post.id}>
            <strong>{post.author.name}</strong>
            <span className="studio-muted"> @{post.author.username}</span>
            <p>{post.text}</p>
            {post.media.map((item) => {
              const src = item.url ?? item.preview_image_url;
              return src ? (
                <img
                  key={item.media_key}
                  className="studio-media"
                  src={src}
                  alt={`X ${item.type}`}
                  loading="lazy"
                />
              ) : null;
            })}
            <small>
              回复 {post.replies} · 转发 {post.reposts} · 喜欢 {post.likes}
            </small>
            <div className="studio-actions">
              <a
                href={`https://x.com/${post.author.username}/status/${post.id}`}
                target="_blank"
                rel="noreferrer"
              >
                View on X ↗
              </a>
              <button
                className="studio-link"
                onClick={() => {
                  const source = `https://x.com/${post.author.username}/status/${post.id}`;
                  const text = `灵感来源：${source}\n\n我的观点：`;
                  if (
                    update((current) => ({
                      ...current,
                      posts: [
                        {
                          id: newId(),
                          text,
                          status: "draft",
                          createdAt: new Date().toISOString(),
                        },
                        ...current.posts,
                      ],
                    }))
                  )
                    setNotice("已创建灵感草稿，可在 Queue 中继续编辑。 ");
                }}
              >
                用于创作 →
              </button>
              <button
                className="studio-link"
                onClick={() =>
                  update((current) => ({
                    ...current,
                    bookmarkedPostIds: current.bookmarkedPostIds.includes(
                      post.id,
                    )
                      ? current.bookmarkedPostIds.filter((id) => id !== post.id)
                      : [...current.bookmarkedPostIds, post.id],
                    savedInspiration: current.bookmarkedPostIds.includes(
                      post.id,
                    )
                      ? current.savedInspiration.filter(
                          (item) => item.id !== post.id,
                        )
                      : [
                          post,
                          ...current.savedInspiration.filter(
                            (item) => item.id !== post.id,
                          ),
                        ],
                  }))
                }
              >
                {data.bookmarkedPostIds.includes(post.id) ? "取消收藏" : "收藏"}
              </button>
            </div>
          </article>
        ))}
      </div>
      {tab !== "saved" && results.length > 0 && shown.length === 0 && (
        <div className="studio-empty">本次结果中没有符合筛选条件的帖子。</div>
      )}
      {tab !== "saved" && results.length === 0 && !loading && !error && (
        <div className="studio-empty">
          搜索一个话题，查看来自 X 的{tab === "media" ? "媒体" : "帖子"}。
        </div>
      )}
      {tab === "saved" && data.savedInspiration.length === 0 && (
        <div className="studio-empty">
          还没有收藏。搜索帖子后点击收藏即可保存到这里。
        </div>
      )}
    </Page>
  );
}

const interestGroups: Record<string, string[]> = {
  Business: [
    "Startups",
    "Investing",
    "Marketing",
    "Sales",
    "Leadership",
    "Entrepreneurship",
  ],
  Technology: ["AI/ML", "Web3", "SaaS", "Cybersecurity", "DevOps", "Mobile"],
  Creativity: ["Design", "Writing", "Photography", "Music", "Film", "Art"],
  Lifestyle: [
    "Fitness",
    "Travel",
    "Food",
    "Fashion",
    "Wellness",
    "Mindfulness",
  ],
  Science: ["Physics", "Biology", "Space", "Climate", "Medicine", "Psychology"],
  Finance: [
    "Crypto",
    "Stocks",
    "Real Estate",
    "Personal Finance",
    "Economics",
    "Trading",
  ],
};

export function ContextPage() {
  const { data, update, error } = useWorkspace();
  const [product, setProduct] = useState("");
  const [styleSuggestion, setStyleSuggestion] = useState<string | null>(null);
  const [styleLoading, setStyleLoading] = useState(false);
  const [styleNotice, setStyleNotice] = useState("");
  async function regenerateStyle() {
    setStyleLoading(true);
    setStyleNotice("");
    setStyleSuggestion(null);
    try {
      const posts = await trpcClient.signals.recentOwnPosts.mutate();
      const suggestion = styleGuideFromPosts(posts);
      if (!suggestion) {
        setStyleNotice("近期原创帖子不足 3 条，无法生成可靠的风格观察。");
        return;
      }
      setStyleSuggestion(suggestion);
    } catch (cause) {
      setStyleNotice(
        cause instanceof Error ? cause.message : "读取近期帖子失败。",
      );
    } finally {
      setStyleLoading(false);
    }
  }
  return (
    <Page title="Context" subtitle="定义 AI 写什么、写给谁，以及你的表达方式。">
      <section className="studio-card">
        <h2>Account Rules</h2>
        <p className="studio-muted">
          这些明确规则会应用于 Worker 生成的草稿，优先于 Worker
          的额外要求。已保存的草稿不会被改写。
        </p>
        <label>
          <input
            type="checkbox"
            checked={data.writingRules.noQuestions}
            onChange={(event) =>
              update((current) => ({
                ...current,
                writingRules: {
                  ...current.writingRules,
                  noQuestions: event.target.checked,
                },
              }))
            }
          />
          不写问句
        </label>
        <label>
          <input
            type="checkbox"
            checked={data.writingRules.noNumberedLists}
            onChange={(event) =>
              update((current) => ({
                ...current,
                writingRules: {
                  ...current.writingRules,
                  noNumberedLists: event.target.checked,
                },
              }))
            }
          />
          不使用编号列表
        </label>
      </section>
      <section className="studio-card">
        <h2>About You</h2>
        <p className="studio-muted">为写作提供主题背景，不决定写作风格。</p>
        <textarea
          aria-label="About You"
          maxLength={500}
          rows={5}
          value={data.about}
          onChange={(e) =>
            update((current) => ({ ...current, about: e.target.value }))
          }
        />
        <small>{data.about.length}/500 characters</small>
      </section>
      <section className="studio-card">
        <div className="studio-inline">
          <h2>Style Guide</h2>
          <button
            className="studio-secondary"
            disabled={styleLoading}
            onClick={() => void regenerateStyle()}
          >
            {styleLoading ? "读取中…" : "根据近期帖子重新生成"}
          </button>
        </div>
        <p className="studio-muted">你的修改优先于自动生成内容。</p>
        <p className="studio-muted">
          手动读取最多 30 条 X 原创帖子，会消耗 X API 额度；生成建议前需连接 X。
        </p>
        {styleSuggestion && (
          <div className="studio-post-preview">
            <strong>建议预览</strong>
            <p>{styleSuggestion}</p>
            <div className="studio-inline">
              <button
                className="studio-primary"
                onClick={() => {
                  if (
                    update((current) => ({
                      ...current,
                      vocabulary: styleSuggestion,
                    }))
                  ) {
                    setStyleSuggestion(null);
                    setStyleNotice("风格建议已应用，你仍可继续编辑。");
                  }
                }}
              >
                应用到 Style & Vocabulary
              </button>
              <button
                className="studio-secondary"
                onClick={() => setStyleSuggestion(null)}
              >
                放弃
              </button>
            </div>
          </div>
        )}
        <Alert text={styleNotice} />
        <label>
          Audience
          <textarea
            rows={4}
            maxLength={600}
            value={data.audience}
            onChange={(e) =>
              update((current) => ({ ...current, audience: e.target.value }))
            }
          />
        </label>
        <small>{data.audience.length}/600</small>
        <label>
          Style & Vocabulary
          <textarea
            rows={5}
            maxLength={1200}
            value={data.vocabulary}
            onChange={(e) =>
              update((current) => ({ ...current, vocabulary: e.target.value }))
            }
          />
        </label>
      </section>
      <section className="studio-card">
        <h2>Your Products</h2>
        <div className="studio-inline">
          <input
            aria-label="产品名称"
            value={product}
            onChange={(e) => setProduct(e.target.value)}
            placeholder="你正在构建的产品"
          />
          <button
            className="studio-primary"
            onClick={() => {
              if (product.trim()) {
                update((current) => ({
                  ...current,
                  products: [...current.products, product.trim()],
                }));
                setProduct("");
              }
            }}
          >
            Add product
          </button>
        </div>
        {data.products.length === 0 && (
          <p className="studio-muted">No products added yet</p>
        )}
        <div className="studio-chips">
          {data.products.map((item, index) => (
            <button
              key={`${item}-${index}`}
              onClick={() =>
                update((current) => ({
                  ...current,
                  products: current.products.filter((_, i) => i !== index),
                }))
              }
            >
              {item} ×
            </button>
          ))}
        </div>
      </section>
      <section className="studio-card">
        <h2>Your Interests</h2>
        <p className="studio-muted">决定哪些内容激发你的灵感。</p>
        {Object.entries(interestGroups).map(([group, items]) => (
          <div key={group}>
            <h3>{group}</h3>
            <div className="studio-chips">
              {items.map((item) => (
                <button
                  key={item}
                  aria-pressed={data.interests.includes(item)}
                  className={data.interests.includes(item) ? "selected" : ""}
                  onClick={() =>
                    update((current) => ({
                      ...current,
                      interests: current.interests.includes(item)
                        ? current.interests.filter((value) => value !== item)
                        : [...current.interests, item],
                    }))
                  }
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        ))}
      </section>
      <Alert text={error} />
    </Page>
  );
}

export function ContactsPage() {
  const { data, update, error } = useWorkspace();
  const [handle, setHandle] = useState("");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [group, setGroup] = useState("");
  const [filter, setFilter] = useState("all");
  const [groupFilter, setGroupFilter] = useState("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activityDrafts, setActivityDrafts] = useState<Record<string, string>>(
    {},
  );
  const groups = [
    ...new Set(data.contacts.map((contact) => contact.group).filter(Boolean)),
  ];
  function add() {
    const cleaned = handle.trim().replace(/^@/, "");
    if (!/^[a-zA-Z0-9_]{1,15}$/.test(cleaned)) return;
    update((current) => ({
      ...current,
      contacts: current.contacts.some(
        (person) => person.handle.toLowerCase() === cleaned.toLowerCase(),
      )
        ? current.contacts
        : [
            {
              id: newId(),
              handle: cleaned,
              name: name.trim() || cleaned,
              note: note.trim(),
              group: group.trim(),
              status: "new",
              activities: [],
            },
            ...current.contacts,
          ],
    }));
    setHandle("");
    setName("");
    setNote("");
    setGroup("");
  }
  return (
    <Page title="Contacts" subtitle="整理值得跟进的 X 联系人。">
      <section className="studio-card">
        <h2>Add contact</h2>
        <div className="studio-form-grid">
          <input
            aria-label="X handle"
            placeholder="@ handle"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
          />
          <input
            aria-label="Name"
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            aria-label="Note"
            placeholder="为什么值得跟进"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <input
            aria-label="Group"
            placeholder="分组（可选）"
            value={group}
            onChange={(e) => setGroup(e.target.value)}
          />
          <button className="studio-primary" onClick={add}>
            Add
          </button>
        </div>
      </section>
      <section className="studio-card">
        <div className="studio-section-head">
          <h2>All contacts · {data.contacts.length}</h2>
          <div className="studio-inline">
            <select
              aria-label="筛选联系人状态"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">All statuses</option>
              <option value="new">New</option>
              <option value="qualified">Qualified</option>
              <option value="contacted">Contacted</option>
              <option value="archived">Archived</option>
            </select>
            <select
              aria-label="筛选联系人分组"
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
            >
              <option value="all">All groups</option>
              {groups.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
        </div>
        {data.contacts
          .filter(
            (contact) =>
              (filter === "all" || contact.status === filter) &&
              (groupFilter === "all" || contact.group === groupFilter),
          )
          .map((contact) => (
            <article className="studio-row" key={contact.id}>
              <div>
                <strong>{contact.name}</strong>{" "}
                <a
                  href={`https://x.com/${contact.handle}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  @{contact.handle} ↗
                </a>
                <p>{contact.note}</p>
                {contact.group && <small>分组：{contact.group}</small>}
                {editingId === contact.id && (
                  <div className="studio-contact-details">
                    <label>
                      备注
                      <textarea
                        aria-label={`${contact.handle} 的备注`}
                        value={contact.note}
                        onChange={(e) =>
                          update((current) => ({
                            ...current,
                            contacts: current.contacts.map((item) =>
                              item.id === contact.id
                                ? { ...item, note: e.target.value }
                                : item,
                            ),
                          }))
                        }
                      />
                    </label>
                    <label>
                      分组
                      <input
                        aria-label={`${contact.handle} 的分组`}
                        value={contact.group ?? ""}
                        onChange={(e) =>
                          update((current) => ({
                            ...current,
                            contacts: current.contacts.map((item) =>
                              item.id === contact.id
                                ? { ...item, group: e.target.value }
                                : item,
                            ),
                          }))
                        }
                      />
                    </label>
                    <h3>跟进记录</h3>
                    {(contact.activities ?? []).map((activity) => (
                      <p key={activity.id}>
                        <small>{new Date(activity.at).toLocaleString()}</small>{" "}
                        · {activity.text}
                      </p>
                    ))}
                    <div className="studio-inline">
                      <input
                        aria-label={`${contact.handle} 的新跟进记录`}
                        placeholder="记录一次跟进"
                        value={activityDrafts[contact.id] ?? ""}
                        onChange={(e) =>
                          setActivityDrafts((current) => ({
                            ...current,
                            [contact.id]: e.target.value,
                          }))
                        }
                      />
                      <button
                        className="studio-secondary"
                        disabled={!activityDrafts[contact.id]?.trim()}
                        onClick={() => {
                          const text = activityDrafts[contact.id]?.trim();
                          if (!text) return;
                          if (
                            update((current) => ({
                              ...current,
                              contacts: current.contacts.map((item) =>
                                item.id === contact.id
                                  ? {
                                      ...item,
                                      activities: [
                                        ...(item.activities ?? []),
                                        {
                                          id: newId(),
                                          at: new Date().toISOString(),
                                          text,
                                        },
                                      ],
                                    }
                                  : item,
                              ),
                            }))
                          ) {
                            setActivityDrafts((current) => ({
                              ...current,
                              [contact.id]: "",
                            }));
                          }
                        }}
                      >
                        添加记录
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <div className="studio-inline">
                <button
                  className="studio-secondary"
                  onClick={() =>
                    setEditingId(editingId === contact.id ? null : contact.id)
                  }
                >
                  {editingId === contact.id ? "收起" : "详情"}
                </button>
                <select
                  aria-label={`${contact.handle} 的状态`}
                  value={contact.status}
                  onChange={(e) =>
                    update((current) => ({
                      ...current,
                      contacts: current.contacts.map((item) =>
                        item.id === contact.id
                          ? {
                              ...item,
                              status: e.target.value as typeof item.status,
                            }
                          : item,
                      ),
                    }))
                  }
                >
                  <option value="new">New</option>
                  <option value="qualified">Qualified</option>
                  <option value="contacted">Contacted</option>
                  <option value="archived">Archived</option>
                </select>
                <button
                  className="studio-link danger"
                  onClick={() =>
                    update((current) => ({
                      ...current,
                      contacts: current.contacts.filter(
                        (item) => item.id !== contact.id,
                      ),
                    }))
                  }
                >
                  删除
                </button>
              </div>
            </article>
          ))}
        {data.contacts.length === 0 && (
          <p className="studio-muted">
            还没有联系人。可以手动添加，或从 Signals 收集线索。
          </p>
        )}
      </section>
      <Alert text={error} />
    </Page>
  );
}

export function DmsPage() {
  const { data, update, error } = useWorkspace();
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  function queue() {
    if (!selected.length || !message.trim())
      return setNotice("请选择收件人并填写消息。");
    if (
      update((current) => ({
        ...current,
        messages: [
          {
            id: newId(),
            recipients: selected,
            text: message.trim(),
            createdAt: new Date().toISOString(),
            status: "pending",
          },
          ...current.messages,
        ],
      }))
    ) {
      setMessage("");
      setSelected([]);
      setNotice("已保存到待发送列表。当前不会自动发送私信。");
    }
  }
  const preview = data.contacts.find((contact) => contact.id === selected[0]);
  return (
    <Page title="Direct Messages" subtitle="准备个性化私信，发送前逐条确认。">
      <div className="studio-grid-2">
        <section className="studio-card">
          <h2>Recipients</h2>
          <div className="studio-contact-picker">
            {data.contacts.map((contact) => (
              <label key={contact.id}>
                <input
                  type="checkbox"
                  checked={selected.includes(contact.id)}
                  onChange={() =>
                    setSelected((current) =>
                      current.includes(contact.id)
                        ? current.filter((id) => id !== contact.id)
                        : [...current, contact.id],
                    )
                  }
                />
                {contact.name} @{contact.handle}
              </label>
            ))}
          </div>
          {data.contacts.length === 0 && (
            <p className="studio-muted">先到 Contacts 添加联系人。</p>
          )}
          <label>
            Message
            <textarea
              rows={7}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Hey [first], thanks for engaging…"
            />
          </label>
          <p className="studio-muted">可用变量：[name] [first] [handle]</p>
          <button className="studio-primary" onClick={queue}>
            保存到待发送
          </button>
          <Alert text={notice || error} />
        </section>
        <section className="studio-card">
          <h2>Preview</h2>
          <div className="studio-post-preview">
            <strong>{preview?.name || "收件人"}</strong>
            <p>
              {message
                .replaceAll("[name]", preview?.name || "姓名")
                .replaceAll("[first]", preview?.name.split(" ")[0] || "名字")
                .replaceAll("[handle]", preview?.handle || "handle") ||
                "Your message will appear here…"}
            </p>
          </div>
          <p className="studio-muted">
            只有对方允许接收私信且已同意联系，才能实际发送。
          </p>
        </section>
      </div>
      <section className="studio-card">
        <h2>Pending DMs · {data.messages.length}</h2>
        {data.messages.length === 0 && (
          <p className="studio-muted">No DMs prepared yet.</p>
        )}
        {data.messages.map((item) => (
          <article className="studio-row" key={item.id}>
            <div>
              <strong>
                {item.recipients.length} 位收件人 ·{" "}
                {item.status === "paused" ? "已暂停" : "待发送"}
              </strong>
              <p>{item.text}</p>
            </div>
            <div className="studio-inline">
              <button
                className="studio-link"
                onClick={() =>
                  update((current) => ({
                    ...current,
                    messages: current.messages.map((entry) =>
                      entry.id === item.id
                        ? {
                            ...entry,
                            status:
                              entry.status === "paused" ? "pending" : "paused",
                          }
                        : entry,
                    ),
                  }))
                }
              >
                {item.status === "paused" ? "恢复" : "暂停"}
              </button>
              <button
                className="studio-link danger"
                onClick={() =>
                  update((current) => ({
                    ...current,
                    messages: current.messages.filter(
                      (entry) => entry.id !== item.id,
                    ),
                  }))
                }
              >
                清除
              </button>
            </div>
          </article>
        ))}
      </section>
    </Page>
  );
}

export function AnalyticsPage() {
  const { data, update } = useWorkspace();
  const [metrics, setMetrics] = useState<Awaited<
    ReturnType<typeof trpcClient.signals.analytics.mutate>
  > | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [days, setDays] = useState(30);
  const [analyticsTab, setAnalyticsTab] = useState<AnalyticsTab>("posts");
  const [asOf, setAsOf] = useState(() => Date.now());
  const cutoff = asOf - days * 24 * 60 * 60 * 1000;
  const history = data.followerHistory
    .filter(
      (point) =>
        Number.isFinite(point.followers) &&
        Number.isFinite(Date.parse(point.recordedAt)) &&
        Date.parse(point.recordedAt) >= cutoff,
    )
    .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  const followerGain =
    history.length > 1
      ? history[history.length - 1]!.followers - history[0]!.followers
      : null;
  const visiblePosts =
    metrics?.posts.filter(
      (post) => post.createdAt && Date.parse(post.createdAt) >= cutoff,
    ) ?? [];
  const selectedPosts = selectAnalyticsPosts(visiblePosts, analyticsTab);
  const topPosts = selectAnalyticsPosts(visiblePosts, "engaged").slice(0, 3);
  const followerValues = history.map((point) => point.followers);
  const followerMin = Math.min(...followerValues);
  const followerSpan = Math.max(...followerValues) - followerMin || 1;
  const counts = {
    drafts: data.posts.filter((post) => post.status === "draft").length,
    scheduled: data.posts.filter((post) => post.status === "scheduled").length,
    review: data.posts.filter((post) => post.status === "review").length,
  };
  function exportData() {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            generatedAt: new Date().toISOString(),
            counts,
            metrics: metrics ? { ...metrics, posts: visiblePosts } : null,
            followerHistory: history,
            posts: data.posts,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "signal-agent-content.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }
  function exportCsv() {
    const blob = new Blob([analyticsPostsCsv(selectedPosts)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `signal-agent-posts-${days}d-${analyticsTab}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }
  async function load() {
    setLoading(true);
    setError("");
    try {
      const result = await trpcClient.signals.analytics.mutate();
      setMetrics(result);
      setAsOf(Date.now());
      update((current) => ({
        ...current,
        followerHistory: [
          ...current.followerHistory.filter(
            (point) =>
              point.recordedAt.slice(0, 10) !==
              new Date().toISOString().slice(0, 10),
          ),
          { recordedAt: new Date().toISOString(), followers: result.followers },
        ],
      }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "读取统计失败。");
    } finally {
      setLoading(false);
    }
  }
  return (
    <Page
      title="Analytics"
      subtitle="查看内容准备情况与账号表现。"
      actions={
        <div className="studio-inline">
          <select
            aria-label="Analytics time range"
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
          >
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
          </select>
          <button
            className="studio-secondary"
            disabled={loading}
            onClick={() => void load()}
          >
            {loading ? "Loading…" : "Load from X"}
          </button>
          <button
            className="studio-secondary"
            disabled={!selectedPosts.length}
            onClick={exportCsv}
          >
            Export CSV
          </button>
          <button className="studio-secondary" onClick={exportData}>
            Export JSON
          </button>
        </div>
      }
    >
      <div className="studio-stats">
        <div className="studio-stat">
          <strong>{counts.drafts}</strong>
          <span>草稿</span>
        </div>
        <div className="studio-stat">
          <strong>{counts.review}</strong>
          <span>待审核</span>
        </div>
        <div className="studio-stat">
          <strong>{counts.scheduled}</strong>
          <span>已排期</span>
        </div>
      </div>
      <Alert text={error} />
      <section className="studio-card">
        <h2>Follower Gain</h2>
        {history.length ? (
          <>
            <strong className="studio-big-number">
              {followerGain === null
                ? "—"
                : `${followerGain >= 0 ? "+" : ""}${followerGain.toLocaleString()}`}
            </strong>
            <p className="studio-muted">
              最近一次记录：
              {history[history.length - 1]!.followers.toLocaleString()} 位粉丝。
              {history.length < 2
                ? "再读取一天的数据后可计算增长。"
                : `基于所选 ${days} 天内的 ${history.length} 次每日记录。`}
            </p>
            {history.length > 1 && (
              <svg
                className="studio-follower-chart"
                viewBox="0 0 600 160"
                aria-label={`${days} 天内的粉丝数变化`}
              >
                <title>{days} 天内的粉丝数变化</title>
                <polyline
                  fill="none"
                  stroke="#e1442d"
                  strokeWidth="3"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  points={history
                    .map((point, index) => {
                      return `${(index / (history.length - 1)) * 580 + 10},${140 - ((point.followers - followerMin) / followerSpan) * 120}`;
                    })
                    .join(" ")}
                />
              </svg>
            )}
          </>
        ) : (
          <div className="studio-empty">
            所选时间内没有粉丝记录。点击 Load from X
            保存今天的记录；此操作会消耗 X API 额度。
          </div>
        )}
      </section>
      <section className="studio-card">
        <h2>Posts that generated the most engagement</h2>
        <p className="studio-muted">
          X 返回的近期帖子中，显示所选时间内互动最高的 3 条。
        </p>
        {metrics ? (
          topPosts.length ? (
            topPosts.map((post) => (
              <article className="studio-row" key={post.id}>
                <div>
                  <p>{post.text}</p>
                  <small>
                    回复 {post.replies} · 转发 {post.reposts} · 喜欢{" "}
                    {post.likes}
                    {post.impressions === null
                      ? ""
                      : ` · 浏览 ${post.impressions}`}
                  </small>
                </div>
                <a
                  href={`https://x.com/i/status/${post.id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View on X ↗
                </a>
              </article>
            ))
          ) : (
            <div className="studio-empty">所选时间内没有返回热门帖子。</div>
          )
        ) : (
          <div className="studio-empty">读取 X 统计后显示表现最佳的帖子。</div>
        )}
      </section>
      <section className="studio-card">
        <h2>Post details</h2>
        <div
          className="studio-analytics-tabs"
          role="tablist"
          aria-label="Post categories"
        >
          {(
            [
              ["posts", "Posts"],
              ["replies", "Replies"],
              ["reposts", "Reposts"],
              ["best", "Best posts"],
              ["engaged", "Most engaged"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={analyticsTab === value}
              className={analyticsTab === value ? "active" : ""}
              onClick={() => setAnalyticsTab(value)}
            >
              {label}
            </button>
          ))}
        </div>
        {selectedPosts.length ? (
          <div className="studio-table-scroll">
            <table className="studio-analytics-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Post</th>
                  <th>Likes</th>
                  <th>Replies</th>
                  <th>Reposts</th>
                  <th>Views</th>
                  <th>Link</th>
                </tr>
              </thead>
              <tbody>
                {selectedPosts.map((post) => (
                  <tr key={post.id}>
                    <td>
                      {post.createdAt
                        ? new Date(post.createdAt).toLocaleDateString()
                        : "—"}
                    </td>
                    <td>
                      <span className="studio-analytics-post-text">
                        {post.text}
                      </span>
                    </td>
                    <td>{post.likes}</td>
                    <td>{post.replies}</td>
                    <td>{post.reposts}</td>
                    <td>{post.impressions ?? "—"}</td>
                    <td>
                      <a
                        href={`https://x.com/i/status/${post.id}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View ↗
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="studio-empty">
            {metrics
              ? "所选时间和分类下没有帖子。"
              : "读取 X 统计后显示帖子明细。"}
          </div>
        )}
        <p className="studio-muted">
          单次读取最多获取 X 最近 30 条帖子；CSV 导出当前时间范围和分类。
        </p>
      </section>
    </Page>
  );
}
