import type { StudioData } from "./store";

export function applyWritingRules(
  text: string,
  rules: StudioData["writingRules"],
): string {
  return text
    .split("\n")
    .filter((line) => !rules.noNumberedLists || !/^\s*\d+[.、]\s/.test(line))
    .map((line) =>
      rules.noQuestions ? line.replace(/[^。！？\n]*[？?]/g, "") : line,
    )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
