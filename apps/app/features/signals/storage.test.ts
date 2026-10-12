import { createInitialData } from "@repo/core/signals";
import { describe, expect, it } from "vitest";

import { loadData, saveData } from "./storage";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

describe("storage", () => {
  it("keeps real accounts and demonstration data isolated", () => {
    const storage = memoryStorage();
    const data = createInitialData();
    data.agents[0].name = "Real account A";
    saveData(storage, data, "signal-agent-x-v1:a");
    expect(loadData(storage, "signal-agent-x-v1:a").data?.agents[0].name).toBe(
      "Real account A",
    );
    expect(
      loadData(storage, "signal-agent-x-v1:b", () => ({
        schemaVersion: 1,
        agents: [],
        leads: [],
      })).data?.agents,
    ).toHaveLength(0);
    expect(loadData(storage).data?.agents[0].name).not.toBe("Real account A");
  });
  it("returns initial data when empty and round trips edits", () => {
    const storage = memoryStorage();
    expect(loadData(storage).data?.agents).toHaveLength(1);
    const data = createInitialData();
    data.agents[0].name = "Changed";
    expect(saveData(storage, data).ok).toBe(true);
    expect(loadData(storage).data?.agents[0].name).toBe("Changed");
  });
  it("preserves malformed data for recovery", () => {
    const storage = memoryStorage();
    storage.setItem("signal-agent-demo-v1", "{bad");
    expect(loadData(storage).error).toBeTruthy();
    expect(storage.getItem("signal-agent-demo-v1")).toBe("{bad");
  });
  it("rejects unsupported versions", () => {
    const storage = memoryStorage();
    storage.setItem(
      "signal-agent-demo-v1",
      JSON.stringify({ schemaVersion: 2 }),
    );
    expect(loadData(storage).error).toBeTruthy();
  });
  it("rejects malformed nested records without replacing them", () => {
    const storage = memoryStorage();
    const bad = JSON.stringify({
      schemaVersion: 1,
      agents: [{ id: "x" }],
      leads: [],
    });
    storage.setItem("signal-agent-demo-v1", bad);
    expect(loadData(storage).data).toBeNull();
    expect(storage.getItem("signal-agent-demo-v1")).toBe(bad);
  });
});
