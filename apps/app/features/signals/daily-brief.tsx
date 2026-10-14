import type { AgentInput } from "@repo/core/signals";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { trpcClient } from "#lib/trpc";

import { ReplyDraft } from "./reply-draft";

import "../signals/styles.css";
import "../signals/utility-theme.css";
import "./brief.css";

const defaultAgent: AgentInput = {
  name: "每日获客",
  icpDescription: "",
  precisionMode: "high",
  signals: [{ type: "keyword", value: "" }],
};
const reviewLabels = {
  new: "待审核",
  follow_up: "值得跟进",
  not_fit: "不合适",
  contacted: "已联系",
};
export function DailyBrief() {
  const qc = useQueryClient();
  const state = useQuery({
    queryKey: ["acquisition"],
    queryFn: () => trpcClient.acquisition.state.query(),
    refetchInterval: 30_000,
  });
  const [edit, setEdit] = useState(false);
  const [product, setProduct] = useState("");
  const [agent, setAgent] = useState(defaultAgent);
  const [enabled, setEnabled] = useState(false);
  const [limit, setLimit] = useState<30 | 60 | 100>(30);
  const [filter, setFilter] = useState("new");
  const [error, setError] = useState("");
  const invalidate = () => qc.invalidateQueries({ queryKey: ["acquisition"] });
  const save = useMutation({
    mutationFn: () =>
      trpcClient.acquisition.save.mutate({
        product,
        agent,
        enabled,
        dailyLimit: limit,
      }),
    onSuccess: () => {
      setEdit(false);
      setError("");
      void invalidate();
    },
    onError: (e) => setError(e.message),
  });
  const run = useMutation({
    mutationFn: () => trpcClient.acquisition.run.mutate(),
    onSuccess: () => {
      void invalidate();
    },
    onError: (e) => setError(e.message),
  });
  const review = useMutation({
    mutationFn: (input: { id: string; review: keyof typeof reviewLabels }) =>
      trpcClient.acquisition.review.mutate(input),
    onSuccess: () => {
      void invalidate();
    },
    onError: (e) => setError(e.message),
  });
  function configure() {
    setProduct(state.data?.product ?? "");
    setAgent(state.data?.agent ?? defaultAgent);
    setEnabled(state.data?.enabled ?? false);
    setLimit(
      state.data?.dailyLimit === 60
        ? 60
        : state.data?.dailyLimit === 100
          ? 100
          : 30,
    );
    setEdit(true);
  }
  const row = state.data;
  const running =
    run.isPending ||
    Boolean(row?.leaseUntil && new Date(row.leaseUntil) > new Date());
  return (
    <div className="signal-workspace acquisition-page" data-design="utility">
      <header className="brief-header">
        <Link to="/signals">← Signal Agent 工作台</Link>
        <span>每日简报 · 北京时间</span>
      </header>
      <main className="brief-main">
        <div className="page-heading">
          <div>
            <span className="eyebrow">ACQUISITION LOOP</span>
            <h1>每日获客简报</h1>
            <p>先看来源与匹配依据，再决定联系谁。</p>
          </div>
          <div className="brief-actions">
            <button
              className="secondary-button"
              onClick={configure}
              disabled={running}
            >
              配置获客目标
            </button>
            <button
              className="primary-button"
              disabled={!row || running}
              onClick={() => {
                setError("");
                run.mutate();
              }}
            >
              {running ? "正在发现…" : "立即发现"}
            </button>
          </div>
        </div>
        {(error || state.error) && (
          <p className="brief-error" role="alert">
            {error || state.error?.message}
            。如果数据库尚未初始化，请先应用获客模块迁移。
          </p>
        )}
        {state.isPending && (
          <div className="brief-skeleton" aria-label="正在加载简报" />
        )}
        {edit && (
          <form
            className="brief-config"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            <h2>你的获客目标</h2>
            <label>
              产品与解决的问题
              <textarea
                required
                maxLength={2000}
                value={product}
                onChange={(e) => setProduct(e.target.value)}
                placeholder="产品名称、网址、帮助客户解决的问题"
              />
            </label>
            <label>
              理想客户与需求
              <textarea
                required
                maxLength={4000}
                value={agent.icpDescription}
                onChange={(e) =>
                  setAgent({ ...agent, icpDescription: e.target.value })
                }
                placeholder="客户类型、明确需求、排除条件。当前使用规则匹配，请写出可观察关键词。"
              />
            </label>
            <label>
              匹配精度
              <select
                value={agent.precisionMode}
                onChange={(e) =>
                  setAgent({
                    ...agent,
                    precisionMode:
                      e.target.value === "high" ? "high" : "standard",
                  })
                }
              >
                <option value="high">高精度</option>
                <option value="standard">标准</option>
              </select>
            </label>
            <fieldset>
              <legend>监测来源（最多 3 个）</legend>
              {agent.signals.map((signal, index) => (
                <div className="brief-source" key={index}>
                  <select
                    aria-label={`来源 ${index + 1} 类型`}
                    value={signal.type}
                    onChange={(e) => {
                      const type = e.target.value;
                      if (
                        type !== "keyword" &&
                        type !== "profile_watch" &&
                        type !== "list_watch"
                      )
                        return;
                      setAgent({
                        ...agent,
                        signals: agent.signals.map((item, i) =>
                          i === index ? { ...item, type } : item,
                        ),
                      });
                    }}
                  >
                    <option value="keyword">关键词</option>
                    <option value="profile_watch">账号</option>
                    <option value="list_watch">列表</option>
                  </select>
                  <input
                    required
                    aria-label={`来源 ${index + 1}`}
                    value={signal.value}
                    maxLength={256}
                    onChange={(e) =>
                      setAgent({
                        ...agent,
                        signals: agent.signals.map((item, i) =>
                          i === index
                            ? { ...item, value: e.target.value }
                            : item,
                        ),
                      })
                    }
                  />
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={agent.signals.length === 1}
                    onClick={() =>
                      setAgent({
                        ...agent,
                        signals: agent.signals.filter((_, i) => i !== index),
                      })
                    }
                  >
                    移除
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="secondary-button"
                disabled={agent.signals.length >= 3}
                onClick={() =>
                  setAgent({
                    ...agent,
                    signals: [...agent.signals, { type: "keyword", value: "" }],
                  })
                }
              >
                添加来源
              </button>
            </fieldset>
            <label>
              每日帖子读取预算
              <select
                value={limit}
                onChange={(e) =>
                  setLimit(
                    e.target.value === "60"
                      ? 60
                      : e.target.value === "100"
                        ? 100
                        : 30,
                  )
                }
              >
                <option value="30">30 条</option>
                <option value="60">60 条</option>
                <option value="100">100 条</option>
              </select>
            </label>
            <p>
              最多预留 {limit} 条帖子读取预算／日。X
              还可能收取用户资料查询费用；这不是美元费用上限。失败也占用预算，不自动重试。
            </p>
            <label className="brief-check">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              每天 09:00 自动发现（北京时间）
            </label>
            <p>
              开启后，服务端会在该时间后运行一次。关闭可暂停自动发现，仍能手动运行。本地运行需要保持
              API 服务在线；生产环境需要部署配置好的 Cloudflare Worker。
            </p>
            <div className="brief-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setEdit(false)}
              >
                取消
              </button>
              <button className="primary-button" disabled={save.isPending}>
                {save.isPending ? "保存中…" : "保存配置"}
              </button>
            </div>
          </form>
        )}
        {row && (
          <>
            <div className="brief-summary">
              <article>
                <small>获客目标</small>
                <strong>{row.product}</strong>
              </article>
              <article>
                <small>自动发现</small>
                <strong>
                  {row.enabled ? "已开启 · 每天 09:00" : "已暂停"}
                </strong>
                <span>
                  下次：
                  {new Date(row.nextRunAt).toLocaleString("zh-CN", {
                    timeZone: "Asia/Shanghai",
                  })}
                </span>
              </article>
              <article>
                <small>待审核</small>
                <strong>
                  {row.leads.filter((l) => l.review === "new").length}
                </strong>
                <span>数据库保存 · 跨设备可用</span>
              </article>
            </div>
            <div className="brief-filters" aria-label="审核状态">
              {Object.entries(reviewLabels).map(([value, label]) => (
                <button
                  key={value}
                  className={
                    filter === value ? "primary-button" : "secondary-button"
                  }
                  onClick={() => setFilter(value)}
                >
                  {label}
                </button>
              ))}
              <button
                className={
                  filter === "all" ? "primary-button" : "secondary-button"
                }
                onClick={() => setFilter("all")}
              >
                全部
              </button>
            </div>
            <div className="brief-leads">
              {row.leads
                .filter((lead) => filter === "all" || lead.review === filter)
                .map((lead) => (
                  <article className="brief-lead" key={lead.id}>
                    <div>
                      <h2>
                        {lead.person.displayName}{" "}
                        <small>@{lead.person.username}</small>
                      </h2>
                      <p>{lead.rationale}</p>
                      <blockquote>{lead.provenance.source}</blockquote>
                      <p className="brief-suggestion">
                        建议：{lead.suggestion}
                      </p>
                      {lead.provenance.postUrl && (
                        <a
                          href={lead.provenance.postUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          查看 X 原帖 ↗
                        </a>
                      )}
                      <small>
                        发现于{" "}
                        {new Date(lead.discoveredAt).toLocaleString("zh-CN", {
                          timeZone: "Asia/Shanghai",
                        })}
                      </small>
                    </div>
                    <ReplyDraft
                      id={lead.id}
                      name={lead.person.displayName}
                      sourceUrl={lead.provenance.postUrl}
                      saved={lead.replyDraft}
                    />
                    <aside>
                      <strong>
                        {lead.score}
                        <small>匹配分</small>
                      </strong>
                      <select
                        aria-label={`${lead.person.displayName} 的审核状态`}
                        disabled={review.isPending}
                        value={lead.review}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (
                            value === "new" ||
                            value === "follow_up" ||
                            value === "not_fit" ||
                            value === "contacted"
                          )
                            review.mutate({ id: lead.id, review: value });
                        }}
                      >
                        {Object.entries(reviewLabels).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </aside>
                  </article>
                ))}
            </div>
            {!row.leads.some(
              (l) => filter === "all" || l.review === filter,
            ) && (
              <div className="brief-empty">
                <h2>当前没有待展示的线索</h2>
                <p>
                  首次运行后会收集匹配分至少 60 的新线索，同一 X
                  用户不会重复入库。
                </p>
              </div>
            )}
            <section className="brief-history">
              <h2>运行记录</h2>
              {row.runs.length === 0 ? (
                <p>尚未运行发现。</p>
              ) : (
                row.runs.map((item) => (
                  <article key={item.id}>
                    <span>
                      {new Date(item.startedAt).toLocaleString("zh-CN", {
                        timeZone: "Asia/Shanghai",
                      })}{" "}
                      · {item.trigger === "daily" ? "自动" : "手动"}
                    </span>
                    <strong>
                      {item.status === "success"
                        ? `新增 ${item.added} 条`
                        : item.status === "failed"
                          ? "失败"
                          : "运行中"}
                    </strong>
                    <small>预留 {item.scanned} 条读取预算</small>
                    {item.message && <output>{item.message}</output>}
                  </article>
                ))
              )}
            </section>
          </>
        )}
        {!state.isPending && !row && !state.error && !edit && (
          <div className="brief-empty">
            <h2>从你的产品开始</h2>
            <p>配置目标客户与监测来源，保存后手动运行一次，再开启每日发现。</p>
            <button className="primary-button" onClick={configure}>
              配置获客目标
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
