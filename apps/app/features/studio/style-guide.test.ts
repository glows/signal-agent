import { describe, expect, it } from "vitest";

import { styleGuideFromPosts } from "./style-guide";

describe("styleGuideFromPosts", () => {
  it("requires enough samples to describe a writing pattern", () => {
    expect(styleGuideFromPosts(["一条", "两条"])).toBeNull();
  });

  it("reports observable patterns without guessing an audience", () => {
    const result = styleGuideFromPosts([
      "今天做了一个小工具。你会试吗？ #AI",
      "先验证需求。\n1. 访谈用户\n2. 再动手",
      "上线记录：https://example.com ✨",
    ]);
    expect(result).toContain("最近 3 条原创帖子");
    expect(result).toContain("1 条使用问句");
    expect(result).toContain("1 条使用列表");
    expect(result).toContain("1 条使用话题标签");
    expect(result).toContain("1 条包含链接");
    expect(result).not.toContain("你的受众是");
  });
});
