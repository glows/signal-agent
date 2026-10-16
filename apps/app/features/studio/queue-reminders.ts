import type { StudioPost } from "./store";

const reminderKey = (userId: string) =>
  `signal-agent-queue-reminders:${userId}`;
const deliveredKey = (userId: string, post: StudioPost) =>
  `signal-agent-queue-reminded:${userId}:${post.id}:${post.scheduledAt}`;

export function remindersEnabled(userId: string) {
  return (
    Boolean(userId) && localStorage.getItem(reminderKey(userId)) === "true"
  );
}

export function setRemindersEnabled(userId: string, enabled: boolean) {
  localStorage.setItem(reminderKey(userId), String(enabled));
  window.dispatchEvent(new Event("studio-reminders-change"));
}

export function dueUnremindedPosts(
  posts: StudioPost[],
  now: number,
  wasDelivered: (post: StudioPost) => boolean,
) {
  return posts.filter((post) => {
    if (post.status !== "scheduled" || !post.scheduledAt) return false;
    const scheduledAt = Date.parse(post.scheduledAt);
    return (
      Number.isFinite(scheduledAt) &&
      scheduledAt <= now &&
      scheduledAt >= now - 24 * 60 * 60 * 1000 &&
      !wasDelivered(post)
    );
  });
}

export function notifyDuePosts(userId: string, posts: StudioPost[]) {
  if (
    !remindersEnabled(userId) ||
    typeof Notification === "undefined" ||
    Notification.permission !== "granted"
  )
    return;
  for (const post of dueUnremindedPosts(
    posts,
    Date.now(),
    (item) => localStorage.getItem(deliveredKey(userId, item)) === "true",
  )) {
    try {
      const notification = new Notification("排期帖子待确认发布", {
        body: post.text.slice(0, 120),
        tag: `signal-agent-queue:${post.id}:${post.scheduledAt}`,
      });
      localStorage.setItem(deliveredKey(userId, post), "true");
      notification.onclick = () => {
        window.focus();
        window.location.assign("/queue");
      };
    } catch {
      // Permission can change or the browser may reject page notifications.
      return;
    }
  }
}
