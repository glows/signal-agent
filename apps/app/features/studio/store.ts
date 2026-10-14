import { useEffect, useState } from "react";

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
  interests: string[];
  products: string[];
  bookmarkedPostIds: string[];
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
  interests: [],
  products: [],
  bookmarkedPostIds: [],
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

function read(userId: string): StudioData {
  if (!userId) return empty;
  try {
    const raw = window.localStorage.getItem(key(userId));
    if (!raw) return empty;
    const parsed: unknown = JSON.parse(raw);
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
      followerHistory: Array.isArray(value.followerHistory)
        ? value.followerHistory
        : [],
      interests: Array.isArray(value.interests) ? value.interests : [],
      products: Array.isArray(value.products) ? value.products : [],
      bookmarkedPostIds: Array.isArray(value.bookmarkedPostIds)
        ? value.bookmarkedPostIds
        : [],
    };
  } catch {
    return empty;
  }
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
      window.localStorage.setItem(key(userId), JSON.stringify(next));
      setData(next);
      setError("");
      window.dispatchEvent(new Event("studio-change"));
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
