import { normalizeSignals, validateAgentInput } from "@repo/core/signals";
import { createInitialData } from "@repo/core/signals";
import { describe, expect, it } from "vitest";

describe("agent input", () => {
  it("requires name, ICP and at least one signal", () => {
    expect(
      validateAgentInput({
        name: " ",
        icpDescription: "",
        precisionMode: "standard",
        signals: [],
      }),
    ).toEqual({
      name: "请输入 Agent 名称",
      icpDescription: "请描述理想客户画像",
      signals: "请添加至少一个监测信号",
    });
  });
  it("merges case-insensitive duplicate signals", () => {
    expect(
      normalizeSignals([
        { type: "keyword", value: "  AI  " },
        { type: "keyword", value: "ai" },
      ]),
    ).toHaveLength(1);
  });
  it("starts with stable fictional example leads", () => {
    expect(createInitialData().leads).toHaveLength(2);
  });
});
