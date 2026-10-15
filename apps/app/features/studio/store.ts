import { useEffect, useState } from "react";

import { trpcClient } from "#lib/trpc";

export type PostStatus = "draft" | "review" | "scheduled" | "published";
export interface StudioPost {
  id: string;
  text: string;
  status: PostStatus;
  createdAt: string;
  scheduledAt?: string;
  workerId?: string;
  reviewBrief?: string;
  xPostUrl?: string;
}
export interface StudioWorker {
  id: string;
  name: string;
  topic: string;
  voice: "mine" | "creator" | "hybrid";
  instructions: string;
  count: number;
  active: boolean;
}
export interface StudioContact {
  id: string;
  handle: string;
  name: string;
  note: string;
  group?: string;
  activities?: { id: string; at: string; text: string }[];
  status: "new" | "qualified" | "contacted" | "archived";
}
export interface StudioMessage {
  id: string;
  recipients: string[];
  text: string;
  createdAt: string;
  status: "pending" | "paused";
}
export interface FollowerSnapshot {
  recordedAt: string;
  followers: number;
}
export type InspirationPost = Awaited<
  ReturnType<typeof trpcClient.signals.searchPosts.mutate>
>[number];
export interface StudioData {
  version: 1;
  posts: StudioPost[];
  workers: StudioWorker[];
  contacts: StudioContact[];
  messages: StudioMessage[];
  followerHistory: FollowerSnapshot[];
  about: string;
  audience: string;
  vocabulary: string;
  writingRules: { noQuestions: boolean; noNumberedLists: boolean };
  interests: string[];
  products: string[];
  bookmarkedPostIds: string[];
  savedInspiration: InspirationPost[];
  timezone: string;
  weekStart: "monday" | "sunday";
  textDirection: "ltr" | "rtl";
  showScrollbars: boolean;
  showQuoteConnections: boolean;
  billingDemoCanceled: boolean;
}

const empty: StudioData = {
  version: 1,
  posts: [],
  workers: [],
  contacts: [],
  messages: [],
  followerHistory: [],
  about: "",
  audience: "",
  vocabulary: "",
  writingRules: { noQuestions: false, noNumberedLists: false },
  interests: [],
  products: [],
  bookmarkedPostIds: [],
  savedInspiration: [],
  timezone: "Asia/Shanghai",
  weekStart: "monday",
  textDirection: "ltr",
  showScrollbars: true,
  showQuoteConnections: true,
  billingDemoCanceled: false,
};

function key(userId: string) {
  return `signal-agent-studio-v1:${userId}`;
}

function normalize(parsed: unknown): StudioData {
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("version" in parsed) ||
    parsed.version !== 1
  )
    return empty;
  const value = parsed as Partial<StudioData>;
  return {
    ...empty,
    ...value,
    posts: Array.isArray(value.posts) ? value.posts : [],
    workers: Array.isArray(value.workers) ? value.workers : [],
    contacts: Array.isArray(value.contacts) ? value.contacts : [],
    messages: Array.isArray(value.messages) ? value.messages : [],
    writingRules: {
      noQuestions: value.writingRules?.noQuestions === true,
      noNumberedLists: value.writingRules?.noNumberedLists === true,
    },
    followerHistory: Array.isArray(value.followerHistory)
      ? value.followerHistory
      : [],
    interests: Array.isArray(value.interests) ? value.interests : [],
    products: Array.isArray(value.products) ? value.products : [],
    bookmarkedPostIds: Array.isArray(value.bookmarkedPostIds)
      ? value.bookmarkedPostIds
      : [],
    savedInspiration: Array.isArray(value.savedInspiration)
      ? value.savedInspiration
      : [],
  };
}

function read(userId: string): StudioData {
  if (!userId) return empty;
  try {
    const raw = window.localStorage.getItem(key(userId));
    return raw ? normalize(JSON.parse(raw)) : empty;
  } catch {
    return empty;
  }
}

function write(userId: string, data: StudioData) {
  window.localStorage.setItem(key(userId), JSON.stringify(data));
  window.dispatchEvent(new Event("studio-change"));
}

function hasContent(data: StudioData) {
  return (
    data.posts.length > 0 ||
    data.contacts.length > 0 ||
    data.workers.length > 0 ||
    data.messages.length > 0 ||
    data.followerHistory.length > 0 ||
    data.about.length > 0 ||
    data.audience.length > 0 ||
    data.vocabulary.length > 0 ||
    data.writingRules.noQuestions ||
    data.writingRules.noNumberedLists ||
    data.interests.length > 0 ||
    data.products.length > 0 ||
    data.bookmarkedPostIds.length > 0 ||
    data.savedInspiration.length > 0
  );
}

type SyncSession = {
  initial?: Promise<void>;
  queue: Promise<void>;
  generation: number;
};
const syncSessions = new Map<string, SyncSession>();

function sessionFor(userId: string) {
  let session = syncSessions.get(userId);
  if (!session) {
    session = { queue: Promise.resolve(), generation: 0 };
    syncSessions.set(userId, session);
  }
  return session;
}

function initialize(userId: string, session: SyncSession) {
  session.initial ??= (async () => {
    const remote = await trpcClient.studio.read.query();
    const local = read(userId);
    const hasLocal = window.localStorage.getItem(key(userId)) !== null;
    if (remote) {
      const serverData = normalize(remote.data);
      if (
        hasLocal &&
        remote.revision === 1 &&
        !hasContent(serverData) &&
        hasContent(local)
      ) {
        await trpcClient.studio.save.mutate({
          expectedRevision: remote.revision,
          data: { ...local },
        });
        return;
      }
      if (session.generation === 0) write(userId, normalize(remote.data));
      return;
    }
    if (!hasLocal) return;
    try {
      await trpcClient.studio.save.mutate({
        expectedRevision: 0,
        data: { ...local },
      });
    } catch {
      // Another tab may have created the row. The queued write will read it.
      const created = await trpcClient.studio.read.query();
      if (!created) throw new Error("无法初始化云端工作区。");
      if (session.generation === 0) write(userId, normalize(created.data));
    }
  })();
  return session.initial;
}

export function useStudio(userId: string) {
  const [data, setData] = useState<StudioData>(() => read(userId));
  const [error, setError] = useState("");
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setData(read(userId)));
    function refresh() {
      setData(read(userId));
    }
    window.addEventListener("storage", refresh);
    window.addEventListener("studio-change", refresh);
    if (userId) {
      const session = sessionFor(userId);
      void initialize(userId, session).catch(() => {
        session.initial = undefined;
        setError("云端同步暂不可用，当前修改仍保存在此浏览器。");
      });
    }
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("studio-change", refresh);
    };
  }, [userId]);
  function update(change: (current: StudioData) => StudioData) {
    if (!userId) {
      setError("请先登录，等待账号信息加载完成。");
      return false;
    }
    const next = change(read(userId));
    try {
      write(userId, next);
      setData(next);
      setError("");
      const session = sessionFor(userId);
      const generation = ++session.generation;
      session.queue = session.queue
        .catch(() => {})
        .then(async () => {
          await initialize(userId, session);
          for (let attempt = 0; attempt < 3; attempt++) {
            const remote = await trpcClient.studio.read.query();
            const merged = change(remote ? normalize(remote.data) : empty);
            try {
              await trpcClient.studio.save.mutate({
                expectedRevision: remote?.revision ?? 0,
                data: { ...merged },
              });
              if (session.generation === generation) write(userId, merged);
              return;
            } catch (cause) {
              if (
                attempt === 2 ||
                !(cause instanceof Error) ||
                !cause.message.includes("changed on another device")
              )
                throw cause;
            }
          }
        })
        .catch(() => {
          session.initial = undefined;
          setError("云端同步失败，当前修改仍保存在此浏览器。请稍后重试。");
        });
      return true;
    } catch {
      setError("无法保存到浏览器。请检查站点存储权限与剩余空间。");
      return false;
    }
  }
  return { data, update, error };
}

export function newId() {
  return crypto.randomUUID();
}
