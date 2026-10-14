import type { Lead } from "@repo/core/signals";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@repo/ui";
import { ArrowUpRight, X } from "lucide-react";

const typeLabel = {
  keyword: "关键词",
  profile_watch: "关注账号",
  list_watch: "列表",
};
export function LeadDetail({
  design,
  lead,
  agentName,
  onClose,
  onAddContact,
}: {
  design: "utility" | "nature";
  lead: Lead;
  agentName: string;
  onClose: () => void;
  onAddContact?: () => void;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="signal-workspace"
        data-design={design}
        showCloseButton={false}
        style={{
          padding: 0,
          top: 0,
          right: 0,
          left: "auto",
          transform: "none",
          height: "100vh",
          width: "min(420px, 100vw)",
          maxWidth: 420,
          borderRadius: 0,
        }}
      >
        <DialogTitle className="sr-only">线索详情</DialogTitle>
        <DialogDescription className="sr-only">
          匹配理由及发现来源
        </DialogDescription>
        <aside className="detail-panel">
          <div className="detail-top">
            <span className="eyebrow">LEAD PROFILE</span>
            <button
              className="icon-button"
              onClick={onClose}
              aria-label="关闭详情"
            >
              <X size={19} />
            </button>
          </div>
          <div className="detail-person">
            <span className="avatar large">
              {lead.person.displayName.slice(0, 1)}
            </span>
            <h2>{lead.person.displayName}</h2>
            <p>@{lead.person.username}</p>
          </div>
          <div className="detail-score">
            <span>匹配分数</span>
            <strong>
              {lead.score}
              <small>/ 100</small>
            </strong>
            <div className="score-track">
              <div style={{ width: `${lead.score}%` }} />
            </div>
          </div>
          <section>
            <h3>为什么匹配</h3>
            <p>{lead.rationale}</p>
          </section>
          <section>
            <h3>发现来源</h3>
            <div className="source-card">
              <span className="source-type">
                {typeLabel[lead.provenance.signalType]}
              </span>
              <strong>{lead.provenance.interaction}</strong>
              <p>“{lead.provenance.source}”</p>
            </div>
          </section>
          <section>
            <h3>原始帖子</h3>
            {lead.provenance.postUrl ? (
              <a
                href={lead.provenance.postUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                查看 X 原帖 ↗
              </a>
            ) : (
              <p>演示来源</p>
            )}
          </section>
          <section>
            <h3>公开简介</h3>
            <p>{lead.person.bio}</p>
            <p className="muted">
              {lead.person.followers.toLocaleString()} 位关注者
            </p>
          </section>
          <section>
            <h3>关联 Agent</h3>
            <p>{agentName}</p>
          </section>
          {onAddContact && (
            <button className="primary-button" onClick={onAddContact}>
              加入 Contacts
            </button>
          )}
          <div className="detail-note">
            {lead.dataSource === "x"
              ? "真实 X 数据 · 规则评分"
              : "演示数据 · 人物和帖子均为虚构"}{" "}
            <ArrowUpRight size={14} />
          </div>
        </aside>
      </DialogContent>
    </Dialog>
  );
}
