import type { AgentInput, Signal, SignalInput } from "./types.js";

export type ValidationResult = Partial<
  Record<"name" | "icpDescription" | "signals", string>
>;

export function normalizeSignals(inputs: SignalInput[]): Signal[] {
  const seen = new Set<string>();
  return inputs.flatMap(({ type, value }) => {
    const clean = value.trim().replace(/\s+/g, " ");
    const key = `${type}:${clean.toLocaleLowerCase()}`;
    if (!clean || seen.has(key)) return [];
    seen.add(key);
    return [
      {
        id: crypto.randomUUID(),
        type,
        value: clean,
        status: "active" as const,
      },
    ];
  });
}

export function validateAgentInput(input: AgentInput): ValidationResult {
  const errors: ValidationResult = {};
  if (!input.name.trim()) errors.name = "请输入 Agent 名称";
  if (!input.icpDescription.trim())
    errors.icpDescription = "请描述理想客户画像";
  if (!input.signals.some((signal) => signal.value.trim()))
    errors.signals = "请添加至少一个监测信号";
  return errors;
}
