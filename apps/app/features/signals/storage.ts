import { createInitialData } from "@repo/core/signals";
import type { AppData } from "@repo/core/signals";

const KEY = "signal-agent-demo-v1";
export type LoadResult = { data: AppData | null; error: string | null };
export type SaveResult = { ok: true } | { ok: false; error: string };

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function validData(value: unknown): value is AppData {
  if (
    !record(value) ||
    value.schemaVersion !== 1 ||
    !Array.isArray(value.agents) ||
    !Array.isArray(value.leads)
  )
    return false;
  const agentsValid = value.agents.every(
    (agent) =>
      record(agent) &&
      typeof agent.id === "string" &&
      typeof agent.name === "string" &&
      typeof agent.icpDescription === "string" &&
      (agent.status === "active" || agent.status === "paused") &&
      (agent.precisionMode === "standard" || agent.precisionMode === "high") &&
      Array.isArray(agent.signals) &&
      agent.signals.every(
        (signal: unknown) =>
          record(signal) &&
          typeof signal.value === "string" &&
          ["keyword", "profile_watch", "list_watch"].includes(
            String(signal.type),
          ),
      ),
  );
  const leadsValid = value.leads.every(
    (lead) =>
      record(lead) &&
      typeof lead.id === "string" &&
      typeof lead.agentId === "string" &&
      typeof lead.score === "number" &&
      typeof lead.rationale === "string" &&
      ["fit", "not_fit", "pending"].includes(String(lead.feedback)) &&
      record(lead.person) &&
      typeof lead.person.id === "string" &&
      typeof lead.person.displayName === "string" &&
      typeof lead.person.username === "string" &&
      typeof lead.person.bio === "string" &&
      typeof lead.person.followers === "number" &&
      Array.isArray(lead.person.posts) &&
      record(lead.provenance) &&
      typeof lead.provenance.source === "string" &&
      ["keyword", "profile_watch", "list_watch"].includes(
        String(lead.provenance.signalType),
      ),
  );
  return agentsValid && leadsValid;
}

export function loadData(
  storage: Storage,
  key = KEY,
  initial: () => AppData = createInitialData,
): LoadResult {
  try {
    const raw = storage.getItem(key);
    if (raw === null) return { data: initial(), error: null };
    const value: unknown = JSON.parse(raw);
    if (!validData(value)) {
      return {
        data: null,
        error:
          "本地数据版本不受支持或结构无效。请先备份浏览器数据，或重置演示。",
      };
    }
    return { data: value as AppData, error: null };
  } catch {
    return {
      data: null,
      error: "无法读取本地数据。原数据已保留，可重置演示后继续。",
    };
  }
}

export function saveData(
  storage: Storage,
  data: AppData,
  key = KEY,
): SaveResult {
  try {
    storage.setItem(key, JSON.stringify(data));
    return { ok: true };
  } catch {
    return { ok: false, error: "保存失败。请检查浏览器存储空间或隐私模式。" };
  }
}

export function resetData(
  storage: Storage,
  key = KEY,
  initial: () => AppData = createInitialData,
): AppData {
  storage.removeItem(key);
  return initial();
}
