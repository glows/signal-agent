import type { Agent } from "@repo/core/signals";
import { MoreHorizontal, Play, Pause, Radar, Clock3 } from "lucide-react";

interface Props {
  agent: Agent;
  leads: number;
  selected: boolean;
  running: boolean;
  canRun?: boolean;
  onSelect: () => void;
  onRun: () => void;
  onPause: () => void;
  onEdit: () => void;
  onDelete: () => void;
}
export function AgentCard({
  agent,
  leads,
  selected,
  running,
  canRun = true,
  onSelect,
  onRun,
  onPause,
  onEdit,
  onDelete,
}: Props) {
  return (
    <article className={`agent-card ${selected ? "selected" : ""}`}>
      <div className="agent-card-top">
        <span className="agent-symbol">
          <Radar size={19} />
        </span>
        <span className={`status-pill ${agent.status}`}>
          {agent.status === "active" ? "运行中" : "已暂停"}
        </span>
      </div>
      <button className="agent-card-title" onClick={onSelect}>
        <strong>{agent.name}</strong>
        <span>{agent.icpDescription}</span>
      </button>
      <div className="agent-meta">
        <span>
          <strong>{leads}</strong> 条线索
        </span>
        <span>
          <Clock3 size={13} />{" "}
          {agent.lastCheckedAt
            ? new Date(agent.lastCheckedAt).toLocaleString("zh-CN", {
                month: "numeric",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })
            : "尚未运行"}
        </span>
      </div>
      <div className="agent-card-actions">
        <button
          className="run-button"
          onClick={onRun}
          disabled={!canRun || running || agent.status === "paused"}
        >
          <Play size={14} fill="currentColor" />
          {running ? "正在发现…" : "运行一次"}
        </button>
        <button
          className="icon-button"
          onClick={onPause}
          aria-label={agent.status === "active" ? "暂停 Agent" : "恢复 Agent"}
        >
          {agent.status === "active" ? <Pause size={17} /> : <Play size={17} />}
        </button>
        <details className="more-menu">
          <summary aria-label="更多操作">
            <MoreHorizontal size={18} />
          </summary>
          <div>
            <button onClick={onEdit}>编辑</button>
            <button className="danger" onClick={onDelete}>
              删除
            </button>
          </div>
        </details>
      </div>
    </article>
  );
}
