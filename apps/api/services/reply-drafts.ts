/** Template generation uses text as quoted evidence, never as executable instructions. */
export function generateReplyDraft(
  source: string,
  tone: "professional" | "friendly" | "concise",
  thoughts: string,
) {
  const topic = Array.from(source.replace(/\s+/g, " ").trim())
    .slice(0, 70)
    .join("");
  const opening =
    tone === "professional"
      ? `看到你提到“${topic}”。`
      : tone === "friendly"
        ? `你好，看到你聊到“${topic}”，想多了解一下。`
        : `关于“${topic}”：`;
  const question =
    tone === "concise"
      ? "目前最想解决的一个问题是什么？"
      : "你目前用什么方式处理这件事，最希望改善的部分是什么？";
  return [opening, thoughts.trim(), question].filter(Boolean).join("\n\n");
}
