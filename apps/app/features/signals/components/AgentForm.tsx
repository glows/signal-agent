import { normalizeSignals, validateAgentInput } from "@repo/core/signals";
import type {
  Agent,
  AgentInput,
  SignalInput,
  SignalType,
} from "@repo/core/signals";
import { Plus, X } from "lucide-react";
import { useState } from "react";

const labels: Record<SignalType, string> = {
  keyword: "关键词",
  profile_watch: "关注账号",
  list_watch: "列表",
};

interface Props {
  agent?: Agent;
  live?: boolean;
  onSave: (input: AgentInput) => void;
  onCancel: () => void;
}

export function AgentForm({ agent, live = false, onSave, onCancel }: Props) {
  const [name, setName] = useState(agent?.name ?? "");
  const [icpDescription, setIcpDescription] = useState(
    agent?.icpDescription ?? "",
  );
  const [precisionMode, setPrecisionMode] = useState<
    AgentInput["precisionMode"]
  >(agent?.precisionMode ?? "standard");
  const [signals, setSignals] = useState<SignalInput[]>(
    agent?.signals.map(({ type, value }) => ({ type, value })) ?? [],
  );
  const [signalType, setSignalType] = useState<SignalType>("keyword");
  const [signalValue, setSignalValue] = useState("");
  const [errors, setErrors] = useState<ReturnType<typeof validateAgentInput>>(
    {},
  );

  function addSignal() {
    const value = signalValue.trim();
    if (!value) return;
    const normalized = normalizeSignals([
      ...signals,
      { type: signalType, value },
    ]);
    if (live && normalized.length > 3) {
      setErrors((previous) => ({
        ...previous,
        signals: "真实模式每个 Agent 最多 3 个监测信号",
      }));
      return;
    }
    setSignals(normalized.map(({ type, value }) => ({ type, value })));
    setSignalValue("");
    setErrors((previous) => ({ ...previous, signals: undefined }));
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const input = {
      name: name.trim(),
      icpDescription: icpDescription.trim(),
      precisionMode,
      signals,
    };
    const found = validateAgentInput(input);
    setErrors(found);
    if (Object.keys(found).length) return;
    onSave(input);
  }

  return (
    <form className="agent-form" onSubmit={submit}>
      <div className="modal-heading">
        <div>
          <span className="eyebrow">AGENT CONFIGURATION</span>
          <h2>{agent ? "编辑 Agent" : "创建 Signal Agent"}</h2>
          <p>定义你想找到的人，以及值得留意的公开信号。</p>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={onCancel}
          aria-label="关闭"
        >
          <X size={19} />
        </button>
      </div>
      <label className="field">
        <span>
          Agent 名称 <b>*</b>
        </span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例如：AI SaaS 潜在客户"
          maxLength={60}
        />
        {errors.name && <small role="alert">{errors.name}</small>}
      </label>
      <label className="field">
        <span>
          理想客户画像（ICP）<b>*</b>
        </span>
        <textarea
          value={icpDescription}
          onChange={(e) => setIcpDescription(e.target.value)}
          placeholder="描述行业、角色、正在解决的问题，以及可能的购买意向…"
          rows={4}
          maxLength={4000}
        />
        {errors.icpDescription && (
          <small role="alert">{errors.icpDescription}</small>
        )}
        <em>画像关键词用于可解释的匹配评分。</em>
      </label>
      <div className="field">
        <span>匹配精度</span>
        <div className="precision-options">
          <label className={precisionMode === "standard" ? "selected" : ""}>
            <input
              type="radio"
              name="precision"
              checked={precisionMode === "standard"}
              onChange={() => setPrecisionMode("standard")}
            />
            <strong>标准</strong>
            <span>覆盖更多潜在线索</span>
          </label>
          <label className={precisionMode === "high" ? "selected" : ""}>
            <input
              type="radio"
              name="precision"
              checked={precisionMode === "high"}
              onChange={() => setPrecisionMode("high")}
            />
            <strong>高精度</strong>
            <span>只保留高度匹配的人</span>
          </label>
        </div>
      </div>
      <div className="field">
        <span>
          监测信号 <b>*</b>
        </span>
        <div className="signal-entry">
          <select
            value={signalType}
            onChange={(e) => setSignalType(e.target.value as SignalType)}
            aria-label="信号类型"
          >
            {Object.entries(labels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <input
            maxLength={256}
            value={signalValue}
            onChange={(e) => setSignalValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addSignal();
              }
            }}
            placeholder={
              signalType === "keyword"
                ? "输入关键词，例如 AI"
                : signalType === "profile_watch"
                  ? "输入账号，例如 @liamfounder"
                  : live
                    ? "公开列表 ID 或链接"
                    : "输入列表名"
            }
          />
          <button
            type="button"
            className="secondary-button"
            onClick={addSignal}
          >
            <Plus size={16} /> 添加
          </button>
        </div>
        {errors.signals && <small role="alert">{errors.signals}</small>}
        {signals.length > 0 && (
          <div className="signal-chips">
            {signals.map((signal, index) => (
              <span
                className="signal-chip"
                key={`${signal.type}:${signal.value}`}
              >
                <small>{labels[signal.type]}</small>
                {signal.value}
                <button
                  type="button"
                  onClick={() =>
                    setSignals(signals.filter((_, i) => i !== index))
                  }
                  aria-label={`移除${signal.value}`}
                >
                  <X size={13} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="form-actions">
        <button type="button" className="ghost-button" onClick={onCancel}>
          取消
        </button>
        <button type="submit" className="primary-button">
          {agent ? "保存更改" : "创建 Agent"}
        </button>
      </div>
    </form>
  );
}
