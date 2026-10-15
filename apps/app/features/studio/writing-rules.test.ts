import { describe, expect, it } from "vitest";

import { applyWritingRules } from "./writing-rules";

describe("applyWritingRules", () => {
  it("removes questions and numbered steps when both account rules are on", () => {
    const draft =
      "一个观察：需求在变化。你怎么看？\n\n1. 先听用户\n2. 再做验证\n\n继续记录。";
    expect(
      applyWritingRules(draft, {
        noQuestions: true,
        noNumberedLists: true,
      }),
    ).toBe("一个观察：需求在变化。\n\n继续记录。");
  });

  it("preserves the draft when rules are off", () => {
    const draft = "为什么？\n1. 先验证";
    expect(
      applyWritingRules(draft, {
        noQuestions: false,
        noNumberedLists: false,
      }),
    ).toBe(draft);
  });
});
