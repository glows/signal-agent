import { z } from "zod";

export const workerDraftInput = z.object({
  topic: z.string().trim().min(1).max(200),
  audience: z.string().trim().max(600),
  about: z.string().trim().max(500),
  styleGuide: z.string().trim().max(1200),
  instructions: z.string().trim().max(600),
  voice: z.enum(["mine", "creator", "hybrid"]),
  count: z.number().int().min(1).max(6),
  noQuestions: z.boolean(),
  noNumberedLists: z.boolean(),
  examples: z.array(z.string().trim().max(280)).max(5),
});

export type WorkerDraftInput = z.infer<typeof workerDraftInput>;

export function workerDraftPrompt(input: WorkerDraftInput) {
  const voice = {
    mine: "模仿提供的个人写作样本与风格指南；没有样本时保持自然个人表达。",
    creator: "使用清晰、有吸引力的创作者写作结构，但不要假冒某位具体创作者。",
    hybrid: "保持个人表达，同时借鉴清晰、有吸引力的创作者结构。",
  }[input.voice];
  return [
    `请为 X 写 ${input.count} 条彼此不同的中文帖子，每条不超过 280 字。`,
    `主题：${input.topic}`,
    input.audience && `受众：${input.audience}`,
    input.about && `作者背景：${input.about}`,
    input.styleGuide && `风格指南：${input.styleGuide}`,
    `声音：${voice}`,
    input.instructions && `额外要求：${input.instructions}`,
    input.noQuestions && "硬性规则：不要写问句。",
    input.noNumberedLists && "硬性规则：不要使用编号列表。",
    input.examples.length &&
      `写作样本：\n${input.examples.map((text) => `- ${text}`).join("\n")}`,
    '不要编造统计数据、引言、真实经历或未经提供的产品事实。只返回 JSON 对象，格式为 {"drafts":["帖子一","帖子二"]}，不要代码围栏或解释。',
  ]
    .filter(Boolean)
    .join("\n\n");
}

const responseSchema = z.object({
  drafts: z.array(z.string().trim().min(1).max(280)).min(1).max(6),
});

export function parseWorkerDrafts(
  response: unknown,
  requested: number,
): string[] {
  const output = z.object({ response: z.string() }).safeParse(response);
  if (!output.success) throw new Error("AI 返回的数据不完整。");
  let parsed: unknown;
  try {
    parsed = JSON.parse(
      output.data.response
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, ""),
    );
  } catch {
    throw new Error("AI 未返回有效的草稿格式，请重试。");
  }
  const result = responseSchema.safeParse(parsed);
  if (!result.success || result.data.drafts.length !== requested)
    throw new Error("AI 返回的草稿数量或长度不符合要求，请重试。");
  return result.data.drafts;
}
