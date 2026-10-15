import { describe, expect, it } from "vitest";

import { parseWorkerDrafts, workerDraftPrompt } from "./worker-drafts";

describe("Worker AI drafts", () => {
  it("includes topic, voice, examples, and account rules in the prompt", () => {
    const prompt = workerDraftPrompt({
      topic: "AI 创业",
      audience: "产品创始人",
      about: "做软件产品",
      styleGuide: "短句",
      instructions: "不要营销腔",
      voice: "mine",
      count: 2,
      noQuestions: true,
      noNumberedLists: true,
      examples: ["一个近期观点"],
    });
    expect(prompt).toContain("AI 创业");
    expect(prompt).toContain("不要写问句");
    expect(prompt).toContain("不要使用编号列表");
    expect(prompt).toContain("一个近期观点");
  });

  it("accepts exact draft count and rejects malformed or overlong output", () => {
    expect(
      parseWorkerDrafts({ response: '{"drafts":["第一篇","第二篇"]}' }, 2),
    ).toEqual(["第一篇", "第二篇"]);
    expect(() =>
      parseWorkerDrafts({ response: '{"drafts":["只有一篇"]}' }, 2),
    ).toThrow("数量");
    expect(() =>
      parseWorkerDrafts(
        { response: '{"drafts":["' + "字".repeat(281) + '"]}' },
        1,
      ),
    ).toThrow("长度");
  });
});
