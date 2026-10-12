import { normalizeSignals } from "@repo/core/signals";
import { DEMO_PEOPLE } from "@repo/core/signals";
import { discover } from "@repo/core/signals";
import type {
  Agent,
  AgentInput,
  AppData,
  Feedback,
  Lead,
  SignalType,
} from "@repo/core/signals";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@repo/ui";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  Activity,
  ArrowRight,
  Bell,
  ChevronDown,
  CircleHelp,
  Command,
  Database,
  LayoutDashboard,
  ListFilter,
  Plus,
  Radar,
  RotateCcw,
  Search,
  Settings2,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { signalConnectionQueryOptions } from "#lib/queries/signals";
import { trpcClient } from "#lib/trpc";

import { AgentCard } from "./components/AgentCard";
import { AgentForm } from "./components/AgentForm";
import { LeadDetail } from "./components/LeadDetail";
import { LeadList } from "./components/LeadList";
import { loadData, resetData, saveData } from "./storage";

import "./styles.css";

type Section = "overview" | "agents" | "leads" | "settings";
type Toast = { text: string; kind: "success" | "error" } | null;
const EMPTY_LEADS: Lead[] = [];
const signalLabels: Record<SignalType, string> = {
  keyword: "关键词",
  profile_watch: "关注账号",
  list_watch: "列表",
};

export function SignalWorkspace({
  userId,
  embedded = false,
}: { userId?: string; embedded?: boolean } = {}) {
  const [mode, setMode] = useState<"demo" | "x">("demo");
  const storageKey =
    mode === "demo" ? "signal-agent-demo-v1" : `signal-agent-x-v1:${userId}`;
  const connection = useQuery({
    ...signalConnectionQueryOptions(userId),
    enabled: Boolean(userId) && mode === "x",
  });
  const canRun =
    mode === "demo" ||
    Boolean(connection.data?.configured && connection.data.allowed);
  const emptyLiveData = (): AppData => ({
    schemaVersion: 1,
    agents: [],
    leads: [],
  });
  const [loaded] = useState(() => {
    try {
      return loadData(window.localStorage);
    } catch {
      return {
        data: null,
        error: "浏览器禁止访问本地存储。请允许站点存储后刷新页面。",
      };
    }
  });
  const [data, setData] = useState<AppData | null>(loaded.data);
  const dataRef = useRef<AppData | null>(loaded.data);
  const runTokenRef = useRef(0);
  const [loadError, setLoadError] = useState<string | null>(loaded.error);
  const [section, setSection] = useState<Section>("overview");
  const [selectedAgentId, setSelectedAgentId] = useState<string>("all");
  const [formAgent, setFormAgent] = useState<Agent | "new" | null>(null);
  const [detailLead, setDetailLead] = useState<Lead | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [query, setQuery] = useState("");
  const [minimumScore, setMinimumScore] = useState("0");
  const [feedbackFilter, setFeedbackFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [mobileNav, setMobileNav] = useState(false);

  function switchMode(next: "demo" | "x") {
    if (next === mode || runningId) return;
    const key =
      next === "demo" ? "signal-agent-demo-v1" : `signal-agent-x-v1:${userId}`;
    const restored =
      next === "demo"
        ? loadData(window.localStorage, key)
        : loadData(window.localStorage, key, emptyLiveData);
    runTokenRef.current += 1;
    setMode(next);
    dataRef.current = restored.data;
    setData(restored.data);
    setLoadError(restored.error);
    setSelectedAgentId("all");
    setDetailLead(null);
  }

  function notify(text: string, kind: "success" | "error" = "success") {
    setToast({ text, kind });
    window.setTimeout(() => setToast(null), 4500);
  }

  function commit(next: AppData) {
    const saved = saveData(window.localStorage, next, storageKey);
    if (!saved.ok) {
      notify(saved.error, "error");
      return false;
    }
    dataRef.current = next;
    setData(next);
    return true;
  }

  function saveAgent(input: AgentInput) {
    if (!data) return;
    const now = new Date().toISOString();
    const signals = normalizeSignals(input.signals);
    let saved = false;
    if (formAgent && formAgent !== "new") {
      const next = {
        ...data,
        agents: data.agents.map((agent) =>
          agent.id === formAgent.id
            ? { ...agent, ...input, signals, updatedAt: now }
            : agent,
        ),
      };
      saved = commit(next);
      if (saved) notify("Agent 已更新");
    } else {
      const agent: Agent = {
        ...input,
        id: crypto.randomUUID(),
        signals,
        status: "active",
        createdAt: now,
        updatedAt: now,
        lastCheckedAt: null,
      };
      saved = commit({ ...data, agents: [agent, ...data.agents] });
      if (saved) {
        setSelectedAgentId(agent.id);
        setSection("agents");
        notify("Agent 已创建，现在可以运行发现");
      }
    }
    if (saved) setFormAgent(null);
  }

  function toggleAgent(agent: Agent) {
    if (!data) return;
    const status = agent.status === "active" ? "paused" : "active";
    if (
      commit({
        ...data,
        agents: data.agents.map((item) =>
          item.id === agent.id
            ? { ...item, status, updatedAt: new Date().toISOString() }
            : item,
        ),
      })
    )
      notify(status === "paused" ? "Agent 已暂停" : "Agent 已恢复");
  }

  function deleteAgent(agent: Agent) {
    if (
      !data ||
      !window.confirm(`删除「${agent.name}」及其所有演示线索？此操作不可撤销。`)
    )
      return;
    if (runningId === agent.id) runTokenRef.current += 1;
    if (
      commit({
        ...data,
        agents: data.agents.filter((item) => item.id !== agent.id),
        leads: data.leads.filter((lead) => lead.agentId !== agent.id),
      })
    ) {
      if (selectedAgentId === agent.id) setSelectedAgentId("all");
      notify("Agent 及关联线索已删除");
    }
  }

  async function runAgent(agent: Agent) {
    if (!data || runningId || agent.status === "paused" || !canRun) return;
    const token = ++runTokenRef.current;
    setRunningId(agent.id);
    try {
      const live =
        mode === "x"
          ? await trpcClient.signals.discover.mutate({
              id: agent.id,
              name: agent.name,
              icpDescription: agent.icpDescription,
              precisionMode: agent.precisionMode,
              signals: agent.signals.map(({ type, value }) => ({
                type,
                value,
              })),
            })
          : null;
      if (!live)
        await new Promise((resolve) => window.setTimeout(resolve, 850));
      if (token !== runTokenRef.current) return;
      const current = dataRef.current;
      const currentAgent = current?.agents.find((item) => item.id === agent.id);
      if (
        !current ||
        !currentAgent ||
        currentAgent.status === "paused" ||
        (live && currentAgent.updatedAt !== agent.updatedAt)
      )
        return;
      const knownIds = new Set(current.leads.map((lead) => lead.id));
      const newLeads =
        live?.leads.filter((lead) => !knownIds.has(lead.id)) ?? [];
      const result = live
        ? {
            leads: [...current.leads, ...newLeads],
            added: newLeads.length,
            checkedAt: live.checkedAt,
          }
        : discover(
            currentAgent,
            current.leads,
            DEMO_PEOPLE,
            new Date().toISOString(),
          );
      const next = {
        ...current,
        leads: result.leads,
        agents: current.agents.map((item) =>
          item.id === agent.id
            ? { ...item, lastCheckedAt: result.checkedAt }
            : item,
        ),
      };
      if (commit(next))
        notify(
          live
            ? `读取 ${live.postsScanned} 条 X 帖子，新增 ${result.added} 条线索`
            : result.added
              ? `发现 ${result.added} 条新线索`
              : "运行完成，没有新增线索",
        );
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "发现失败，请稍后重试",
        "error",
      );
    } finally {
      if (token === runTokenRef.current) setRunningId(null);
    }
  }

  function updateFeedback(id: string, feedback: Feedback) {
    if (!data) return;
    if (
      commit({
        ...data,
        leads: data.leads.map((lead) =>
          lead.id === id ? { ...lead, feedback } : lead,
        ),
      })
    )
      notify("反馈已保存");
  }

  function reset() {
    if (
      !window.confirm(
        mode === "demo"
          ? "重置当前数据 Agent、线索和反馈？"
          : "清除本浏览器中的真实模式 Agent、线索和反馈？",
      )
    )
      return;
    try {
      runTokenRef.current += 1;
      const initial =
        mode === "demo"
          ? resetData(window.localStorage, storageKey)
          : resetData(window.localStorage, storageKey, emptyLiveData);
      setRunningId(null);
      dataRef.current = initial;
      setData(initial);
      setLoadError(null);
      setSelectedAgentId("all");
      setSection("overview");
      notify("当前模式的数据已重置");
    } catch {
      notify("重置失败。请检查浏览器存储权限。", "error");
    }
  }

  const agents = data?.agents ?? [];
  const leads = data?.leads ?? EMPTY_LEADS;
  const filteredLeads = useMemo(
    () =>
      leads.filter((lead) => {
        if (selectedAgentId !== "all" && lead.agentId !== selectedAgentId)
          return false;
        if (lead.score < Number(minimumScore)) return false;
        if (feedbackFilter !== "all" && lead.feedback !== feedbackFilter)
          return false;
        if (
          sourceFilter !== "all" &&
          lead.provenance.signalType !== sourceFilter
        )
          return false;
        const search = query.trim().toLocaleLowerCase();
        return (
          !search ||
          `${lead.person.displayName} ${lead.person.username} ${lead.person.bio}`
            .toLocaleLowerCase()
            .includes(search)
        );
      }),
    [leads, selectedAgentId, minimumScore, feedbackFilter, sourceFilter, query],
  );
  const activeCount = agents.filter(
    (agent) => agent.status === "active",
  ).length;
  const fitCount = leads.filter((lead) => lead.feedback === "fit").length;
  const avgScore = leads.length
    ? Math.round(
        leads.reduce((sum, lead) => sum + lead.score, 0) / leads.length,
      )
    : 0;
  const title = {
    overview: "总览",
    agents: "Signal Agents",
    leads: "潜在线索",
    settings: "数据设置",
  }[section];

  function navigate(next: Section) {
    setSection(next);
    setMobileNav(false);
  }
  const nav = (
    <>
      <div className="sidebar-brand">
        <span className="brand-icon">
          <Activity size={20} strokeWidth={2.5} />
        </span>
        <div>
          <strong>
            signal<span>flow</span>
          </strong>
          <small>AGENT WORKSPACE</small>
        </div>
      </div>
      <div className="workspace-switch">
        <span className="workspace-avatar">D</span>
        <div>
          <strong>Demo Workspace</strong>
          <small>本地演示环境</small>
        </div>
        <ChevronDown size={15} />
      </div>
      <div className="nav-group-label">工作台</div>
      <nav className="nav-list">
        <button
          className={section === "overview" ? "active" : ""}
          onClick={() => navigate("overview")}
        >
          <LayoutDashboard size={17} />
          总览
        </button>
        <button
          className={section === "agents" ? "active" : ""}
          onClick={() => navigate("agents")}
        >
          <Radar size={17} />
          Signal Agents <span>{agents.length}</span>
        </button>
        <button
          className={section === "leads" ? "active" : ""}
          onClick={() => navigate("leads")}
        >
          <Users size={17} />
          潜在线索 <span>{leads.length}</span>
        </button>
      </nav>
      <div className="nav-group-label nav-bottom-label">管理</div>
      <nav className="nav-list">
        <button
          className={section === "settings" ? "active" : ""}
          onClick={() => navigate("settings")}
        >
          <Settings2 size={17} />
          数据设置
        </button>
      </nav>
      <div className="sidebar-spacer" />
      <div className="sidebar-callout">
        <Sparkles size={18} />
        <strong>本地功能演示</strong>
        <p>使用虚构数据体验从监测到筛选线索的完整流程。</p>
      </div>
      <div className="sidebar-footer">
        <CircleHelp size={16} /> 所有数据仅存于当前浏览器
      </div>
    </>
  );

  return (
    <div className={`signal-workspace app-shell ${embedded ? "embedded" : ""}`}>
      <aside className={`sidebar ${mobileNav ? "open" : ""}`}>{nav}</aside>
      {mobileNav && (
        <button
          className="mobile-scrim"
          onClick={() => setMobileNav(false)}
          aria-label="关闭菜单"
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="mobile-menu icon-button"
              onClick={() => setMobileNav(true)}
              aria-label="打开菜单"
            >
              <Command size={18} />
            </button>
            <span>Workspace</span>
            <span className="breadcrumb">/</span>
            <strong>{title}</strong>
          </div>
          <div className="topbar-right">
            <div className="mode-controls">
              <button
                disabled={Boolean(runningId)}
                className={mode === "demo" ? "selected" : ""}
                onClick={() => switchMode("demo")}
              >
                演示数据
              </button>
              {userId ? (
                <button
                  disabled={Boolean(runningId)}
                  className={mode === "x" ? "selected" : ""}
                  onClick={() => switchMode("x")}
                >
                  真实 X 数据
                </button>
              ) : (
                <Link to="/signals">连接真实 X</Link>
              )}
            </div>
            <span className="demo-badge">
              <span />
              {mode === "demo" ? "DEMO MODE" : "LIVE X"}
            </span>
            <button
              className="top-icon"
              aria-label="通知"
              onClick={() => notify("当前没有新通知")}
            >
              <Bell size={18} />
            </button>
            <span className="user-avatar">D</span>
          </div>
        </header>
        <main className="main-content">
          {embedded && (
            <div className="workspace-tabs">
              {(["overview", "agents", "leads", "settings"] as const).map(
                (item) => (
                  <button
                    key={item}
                    className={section === item ? "selected" : ""}
                    onClick={() => navigate(item)}
                  >
                    {
                      {
                        overview: "总览",
                        agents: "Agents",
                        leads: "线索",
                        settings: "设置",
                      }[item]
                    }
                  </button>
                ),
              )}
            </div>
          )}
          {mode === "x" && (
            <div className="connection-panel">
              <strong>
                {connection.isPending
                  ? "正在检查 X 连接…"
                  : canRun
                    ? "真实 X 数据已就绪"
                    : "配置 X 数据连接"}
              </strong>
              {connection.error ? (
                <p>{connection.error.message}</p>
              ) : (
                <p>
                  {canRun
                    ? `单次最多读取 ${connection.data?.maxPostsPerRun} 条帖子，点击运行会消耗 X API 额度。`
                    : "请在后端 .env.local 配置 X_BEARER_TOKEN，并将下方账号 ID 加入 X_ALLOWED_USER_IDS。"}
                </p>
              )}
              <small>账号 ID：{userId} · 凭证仅保存在服务端</small>
              <button
                className="secondary-button"
                onClick={() => void connection.refetch()}
              >
                重新检查连接
              </button>
              <p>
                当前使用规则评分；真实线索与 Agent
                保存在此账号的浏览器本地空间。
              </p>
            </div>
          )}
          {loadError || !data ? (
            <div className="recovery">
              <Database size={28} />
              <h1>无法读取本地演示数据</h1>
              <p>{loadError}</p>
              <button className="primary-button" onClick={reset}>
                <RotateCcw size={16} />
                重置演示数据
              </button>
            </div>
          ) : (
            <>
              {section === "overview" && (
                <>
                  <div className="page-heading">
                    <div>
                      <span className="eyebrow">SIGNAL INTELLIGENCE</span>
                      <h1>
                        发现值得关注的客户
                        <span className="heading-spark">✳</span>
                      </h1>
                      <p>设定你想找到的人，用监测信号识别潜在机会。</p>
                    </div>
                    <button
                      className="primary-button"
                      onClick={() => setFormAgent("new")}
                    >
                      <Plus size={17} /> 创建 Agent
                    </button>
                  </div>
                  <div className="hero-banner">
                    <div>
                      <span className="hero-kicker">
                        <Sparkles size={14} /> YOUR GROWTH RADAR
                      </span>
                      <h2>
                        从噪音中，
                        <br />
                        找到真正的信号。
                      </h2>
                      <p>
                        设置监测条件，运行一次模拟发现，查看每条线索背后的匹配理由。
                      </p>
                      <button onClick={() => navigate("agents")}>
                        探索 Signal Agents <ArrowRight size={17} />
                      </button>
                    </div>
                    <div className="hero-art" aria-hidden="true">
                      <div className="orbit orbit-one" />
                      <div className="orbit orbit-two" />
                      <div className="orbit orbit-three" />
                      <div className="orbit-center">
                        <Radar size={32} />
                      </div>
                      <span className="orbit-dot dot-one" />
                      <span className="orbit-dot dot-two" />
                      <span className="orbit-dot dot-three" />
                    </div>
                  </div>
                  <div className="stats-grid">
                    <div className="stat-card">
                      <span>
                        <Radar size={17} /> 活跃 Agent
                      </span>
                      <strong>{activeCount.toString().padStart(2, "0")}</strong>
                      <small>
                        {mode === "demo"
                          ? "已启用的模拟任务"
                          : "已启用的 X 监测配置"}
                      </small>
                    </div>
                    <div className="stat-card">
                      <span>
                        <Users size={17} /> 已发现线索
                      </span>
                      <strong>
                        {leads.length.toString().padStart(2, "0")}
                      </strong>
                      <small>
                        {mode === "demo"
                          ? "来自虚构演示数据"
                          : "来自 X 公开帖子"}
                      </small>
                    </div>
                    <div className="stat-card">
                      <span>
                        <Sparkles size={17} /> 平均匹配分
                      </span>
                      <strong>
                        {avgScore || "—"}
                        {avgScore > 0 && <em>/100</em>}
                      </strong>
                      <small>基于画像与信号计算</small>
                    </div>
                    <div className="stat-card">
                      <span>
                        <Activity size={17} /> 已标记合适
                      </span>
                      <strong>{fitCount.toString().padStart(2, "0")}</strong>
                      <small>人工反馈的线索</small>
                    </div>
                  </div>
                  <div className="section-title">
                    <div>
                      <h2>你的 Signal Agents</h2>
                      <p>管理监测条件并运行线索发现。</p>
                    </div>
                    <button onClick={() => navigate("agents")}>
                      查看全部 <ArrowRight size={15} />
                    </button>
                  </div>
                  <div className="agent-grid">
                    {agents.slice(0, 3).map((agent) => (
                      <AgentCard
                        key={agent.id}
                        agent={agent}
                        leads={
                          leads.filter((lead) => lead.agentId === agent.id)
                            .length
                        }
                        selected={false}
                        canRun={canRun}
                        running={runningId === agent.id}
                        onSelect={() => {
                          setSelectedAgentId(agent.id);
                          navigate("agents");
                        }}
                        onRun={() => runAgent(agent)}
                        onPause={() => toggleAgent(agent)}
                        onEdit={() => setFormAgent(agent)}
                        onDelete={() => deleteAgent(agent)}
                      />
                    ))}
                    <button
                      className="create-card"
                      onClick={() => setFormAgent("new")}
                    >
                      <span>
                        <Plus size={22} />
                      </span>
                      <strong>创建新 Agent</strong>
                      <small>定义新的监测目标</small>
                    </button>
                  </div>
                </>
              )}
              {section === "agents" && (
                <>
                  <div className="page-heading">
                    <div>
                      <span className="eyebrow">MONITOR & DISCOVER</span>
                      <h1>Signal Agents</h1>
                      <p>创建监测任务，发现与你的理想客户画像匹配的人。</p>
                    </div>
                    <button
                      className="primary-button"
                      onClick={() => setFormAgent("new")}
                    >
                      <Plus size={17} /> 创建 Agent
                    </button>
                  </div>
                  <div className="info-strip">
                    <Sparkles size={18} />
                    <div>
                      <strong>
                        {mode === "demo" ? "模拟发现已就绪" : "真实发现模式"}
                      </strong>
                      <span>
                        {mode === "demo"
                          ? "点击运行一次，基于虚构账号和帖子生成线索。"
                          : "配置后端连接后，点击运行一次从 X 获取公开帖子并筛选作者。"}
                      </span>
                    </div>
                  </div>
                  <div className="section-title">
                    <div>
                      <h2>
                        所有 Agents{" "}
                        <span className="count-label">{agents.length}</span>
                      </h2>
                    </div>
                  </div>
                  {agents.length ? (
                    <div className="agent-grid">
                      {agents.map((agent) => (
                        <AgentCard
                          key={agent.id}
                          agent={agent}
                          leads={
                            leads.filter((lead) => lead.agentId === agent.id)
                              .length
                          }
                          selected={selectedAgentId === agent.id}
                          canRun={canRun}
                          running={runningId === agent.id}
                          onSelect={() => {
                            setSelectedAgentId(agent.id);
                            navigate("leads");
                          }}
                          onRun={() => runAgent(agent)}
                          onPause={() => toggleAgent(agent)}
                          onEdit={() => setFormAgent(agent)}
                          onDelete={() => deleteAgent(agent)}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="empty-leads">
                      <Radar size={28} />
                      <h3>尚无 Agent</h3>
                      <p>创建一个 Agent，开始体验模拟发现。</p>
                      <button
                        className="primary-button"
                        onClick={() => setFormAgent("new")}
                      >
                        <Plus size={16} /> 创建 Agent
                      </button>
                    </div>
                  )}
                  <div className="section-title recent-title">
                    <div>
                      <h2>最近发现的线索</h2>
                      <p>每条线索都附有分数和发现依据。</p>
                    </div>
                    <button onClick={() => navigate("leads")}>
                      查看全部 <ArrowRight size={15} />
                    </button>
                  </div>
                  <LeadList
                    leads={leads.slice(-4).reverse()}
                    agents={agents}
                    onFeedback={updateFeedback}
                    onOpen={setDetailLead}
                  />
                </>
              )}
              {section === "leads" && (
                <>
                  <div className="page-heading">
                    <div>
                      <span className="eyebrow">LEAD PIPELINE</span>
                      <h1>潜在线索</h1>
                      <p>查看每次模拟发现的结果，并给出你的判断。</p>
                    </div>
                    <span className="page-count">共 {leads.length} 条线索</span>
                  </div>
                  <div className="filter-panel">
                    <div className="search-box">
                      <Search size={18} />
                      <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="搜索姓名、账号或简介"
                        aria-label="搜索线索"
                      />
                    </div>
                    <div className="filter-row">
                      <ListFilter size={17} />
                      <select
                        value={selectedAgentId}
                        onChange={(e) => setSelectedAgentId(e.target.value)}
                        aria-label="按 Agent 筛选"
                      >
                        <option value="all">所有 Agents</option>
                        {agents.map((agent) => (
                          <option value={agent.id} key={agent.id}>
                            {agent.name}
                          </option>
                        ))}
                      </select>
                      <select
                        value={minimumScore}
                        onChange={(e) => setMinimumScore(e.target.value)}
                        aria-label="最低分数"
                      >
                        <option value="0">所有分数</option>
                        <option value="60">60 分以上</option>
                        <option value="80">80 分以上</option>
                      </select>
                      <select
                        value={feedbackFilter}
                        onChange={(e) => setFeedbackFilter(e.target.value)}
                        aria-label="按反馈筛选"
                      >
                        <option value="all">所有反馈</option>
                        <option value="pending">待定</option>
                        <option value="fit">合适</option>
                        <option value="not_fit">不合适</option>
                      </select>
                      <select
                        value={sourceFilter}
                        onChange={(e) => setSourceFilter(e.target.value)}
                        aria-label="按来源筛选"
                      >
                        <option value="all">所有来源</option>
                        {Object.entries(signalLabels).map(([value, text]) => (
                          <option key={value} value={value}>
                            {text}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="results-heading">
                    <strong>
                      发现结果 <span>{filteredLeads.length}</span>
                    </strong>
                    <small>按匹配分数排序</small>
                  </div>
                  <LeadList
                    leads={[...filteredLeads].sort((a, b) => b.score - a.score)}
                    agents={agents}
                    onFeedback={updateFeedback}
                    onOpen={setDetailLead}
                  />
                </>
              )}
              {section === "settings" && (
                <>
                  <div className="page-heading">
                    <div>
                      <span className="eyebrow">DATA PREFERENCES</span>
                      <h1>演示设置</h1>
                      <p>了解数据范围并管理本地状态。</p>
                    </div>
                  </div>
                  <div className="settings-card">
                    <span className="settings-icon">
                      <Database size={20} />
                    </span>
                    <div>
                      <h2>本地数据</h2>
                      <p>
                        Agent、线索和反馈保存在当前浏览器的
                        localStorage。刷新页面后仍可使用。清除浏览器站点数据会移除这些内容。
                      </p>
                      <div className="settings-facts">
                        <span>{agents.length} 个 Agent</span>
                        <span>{leads.length} 条线索</span>
                        <span>版本 1</span>
                      </div>
                    </div>
                  </div>
                  <div className="settings-card">
                    <span className="settings-icon purple">
                      <RotateCcw size={20} />
                    </span>
                    <div>
                      <h2>重置演示</h2>
                      <p>
                        移除当前所有设置与反馈，清除当前模式中的
                        Agent、线索及反馈。此操作不可撤销。
                      </p>
                      <button
                        className="secondary-button danger-outline"
                        onClick={reset}
                      >
                        <RotateCcw size={16} /> 重置演示数据
                      </button>
                    </div>
                  </div>
                  <div className="settings-footnote">
                    <Sparkles size={18} />
                    <p>
                      {mode === "demo"
                        ? "演示模式使用虚构人物和帖子。"
                        : "真实模式调用 X 官方 API，当前匹配分数由本项目的规则算法生成。"}
                    </p>
                  </div>
                </>
              )}
            </>
          )}
        </main>
        <footer className="main-footer">
          <span>Signal Agent · 功能演示</span>
          <span>
            {mode === "demo" ? "虚构数据 · 本地运行" : "真实 X 数据 · 手动运行"}
          </span>
        </footer>
      </div>
      {formAgent && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setFormAgent(null);
          }}
        >
          <DialogContent
            className="signal-workspace"
            showCloseButton={false}
            style={{
              padding: 0,
              maxWidth: 620,
              display: "block",
              maxHeight: "calc(100vh - 40px)",
              overflowY: "auto",
            }}
          >
            <DialogTitle className="sr-only">Agent 配置</DialogTitle>
            <DialogDescription className="sr-only">
              设置客户画像和监测信号
            </DialogDescription>
            <div className="modal">
              <AgentForm
                live={mode === "x"}
                agent={formAgent === "new" ? undefined : formAgent}
                onSave={saveAgent}
                onCancel={() => setFormAgent(null)}
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
      {detailLead && (
        <LeadDetail
          lead={detailLead}
          agentName={
            agents.find((agent) => agent.id === detailLead.agentId)?.name ??
            "已删除 Agent"
          }
          onClose={() => setDetailLead(null)}
        />
      )}
      {toast && (
        <output className={`toast ${toast.kind}`}>
          {toast.text}
          <button onClick={() => setToast(null)} aria-label="关闭提示">
            <X size={15} />
          </button>
        </output>
      )}
    </div>
  );
}
