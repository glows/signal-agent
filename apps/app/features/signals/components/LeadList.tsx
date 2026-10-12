import type { Agent, Feedback, Lead, SignalType } from "@repo/core/signals";
import { ArrowUpRight, Search } from "lucide-react";

const label: Record<SignalType, string> = {
  keyword: "关键词",
  profile_watch: "关注账号",
  list_watch: "列表",
};
interface Props {
  leads: Lead[];
  agents: Agent[];
  onFeedback: (id: string, feedback: Feedback) => void;
  onOpen: (lead: Lead) => void;
}
export function LeadList({ leads, agents, onFeedback, onOpen }: Props) {
  if (!leads.length)
    return (
      <div className="empty-leads">
        <span>
          <Search size={24} />
        </span>
        <h3>还没有符合条件的线索</h3>
        <p>调整筛选条件，或运行一个活跃的 Agent 来发现模拟线索。</p>
      </div>
    );
  return (
    <div className="lead-list">
      {leads.map((lead) => (
        <article className="lead-row" key={lead.id}>
          <span className="avatar">{lead.person.displayName.slice(0, 1)}</span>
          <div className="lead-person">
            <button onClick={() => onOpen(lead)}>
              {lead.person.displayName} <ArrowUpRight size={14} />
            </button>
            <span>
              @{lead.person.username} · {lead.person.bio}
            </span>
            <small>
              {agents.find((agent) => agent.id === lead.agentId)?.name ??
                "已删除 Agent"}{" "}
              · {label[lead.provenance.signalType]}：
              {lead.provenance.interaction}
            </small>
          </div>
          <div className="lead-score">
            <strong>{lead.score}</strong>
            <span>匹配分</span>
          </div>
          <select
            value={lead.feedback}
            onChange={(e) => onFeedback(lead.id, e.target.value as Feedback)}
            aria-label={`${lead.person.displayName} 的反馈`}
            className={`feedback ${lead.feedback}`}
          >
            <option value="pending">待定</option>
            <option value="fit">合适</option>
            <option value="not_fit">不合适</option>
          </select>
        </article>
      ))}
    </div>
  );
}
