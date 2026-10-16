import { afterEach, describe, expect, it, vi } from "vitest";

import {
  dueUnremindedPosts,
  notifyDuePosts,
  setRemindersEnabled,
} from "./queue-reminders";
import type { StudioPost } from "./store";

describe("queue reminders", () => {
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
  it("selects due scheduled posts once and skips future or stale posts", () => {
    const now = Date.parse("2026-10-16T12:00:00Z");
    const post = (
      id: string,
      scheduledAt: string,
      status: StudioPost["status"] = "scheduled",
    ): StudioPost => ({
      id,
      text: id,
      status,
      createdAt: "2026-10-15T00:00:00Z",
      scheduledAt,
    });
    const posts = [
      post("due", "2026-10-16T12:00:00Z"),
      post("future", "2026-10-16T12:01:00Z"),
      post("old", "2026-10-15T11:59:00Z"),
      post("published", "2026-10-16T12:00:00Z", "published"),
      post("already", "2026-10-16T11:59:00Z"),
    ];
    expect(
      dueUnremindedPosts(posts, now, (item) => item.id === "already").map(
        (item) => item.id,
      ),
    ).toEqual(["due"]);
  });

  it("shows a browser notification only once after opt-in", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-16T12:00:00Z"));
    const createNotification = vi.fn();
    vi.stubGlobal(
      "Notification",
      Object.assign(createNotification, { permission: "granted" }),
    );
    const post: StudioPost = {
      id: "p1",
      text: "Post to publish",
      status: "scheduled",
      createdAt: "2026-10-15T00:00:00Z",
      scheduledAt: "2026-10-16T12:00:00Z",
    };
    notifyDuePosts("user", [post]);
    expect(createNotification).not.toHaveBeenCalled();
    setRemindersEnabled("user", true);
    notifyDuePosts("user", [post]);
    notifyDuePosts("user", [post]);
    expect(createNotification).toHaveBeenCalledTimes(1);
  });
});
