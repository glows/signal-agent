import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { useSessionQuery } from "#lib/queries/session";
import { signalConnectionQueryOptions } from "#lib/queries/signals";
import { type ThemePreference, useTheme } from "#lib/theme";

import { useStudio } from "./store";

import "./studio.css";

type Tab =
  | "General"
  | "Appearance"
  | "Billing"
  | "Team & Permissions"
  | "Context"
  | "API / MCP / CLI";
const tabs: Tab[] = [
  "General",
  "Appearance",
  "Billing",
  "Team & Permissions",
  "Context",
  "API / MCP / CLI",
];

export function AccountPage() {
  const { data: session } = useSessionQuery();
  const { data, update, error } = useStudio(session?.user.id ?? "");
  const { preference, setPreference } = useTheme();
  const connection = useQuery(signalConnectionQueryOptions(session?.user.id));
  const [tab, setTab] = useState<Tab>("General");
  const [cancelStep, setCancelStep] = useState<"offer" | "confirm" | null>(
    null,
  );
  return (
    <div className="studio-page">
      <header className="studio-heading">
        <h1>Account</h1>
      </header>
      <div className="studio-tabs studio-account-tabs">
        {tabs.map((item) => (
          <button
            key={item}
            className={tab === item ? "active" : ""}
            onClick={() => setTab(item)}
          >
            {item}
          </button>
        ))}
      </div>
      {tab === "General" && (
        <>
          <section className="studio-card studio-row">
            <strong>Name</strong>
            <span>{session?.user.name || "—"}</span>
          </section>
          <h2>Settings</h2>
          <section className="studio-card">
            <div className="studio-row">
              <div>
                <strong>Connect to Twitter/X</strong>
                <p className="studio-muted">
                  {connection.data?.connected ? "已连接 X 账号" : "尚未连接"}
                </p>
              </div>
              <Link to="/signals" className="studio-secondary">
                {connection.data?.connected ? "管理连接" : "连接 X"}
              </Link>
            </div>
            <div className="studio-row">
              <div>
                <strong>Timezone</strong>
                <p className="studio-muted">用于队列中的发布时间。</p>
              </div>
              <select
                aria-label="Timezone"
                value={data.timezone}
                onChange={(e) =>
                  update((current) => ({
                    ...current,
                    timezone: e.target.value,
                  }))
                }
              >
                <option value="Asia/Shanghai">Beijing, Shanghai · UTC+8</option>
                <option value="UTC">UTC</option>
                <option value="America/New_York">New York</option>
                <option value="Europe/London">London</option>
              </select>
            </div>
          </section>
          <h2>Default Post Settings</h2>
          <section className="studio-card">
            <p className="studio-muted">
              新帖子在编辑器中预览后保存。发布操作需要 X 写入权限和你的确认。
            </p>
          </section>
        </>
      )}
      {tab === "Appearance" && (
        <section className="studio-card">
          <div className="studio-row">
            <div>
              <strong>Theme</strong>
              <p className="studio-muted">跟随系统或指定明暗主题。</p>
            </div>
            <select
              aria-label="Theme"
              value={preference}
              onChange={(e) => setPreference(e.target.value as ThemePreference)}
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="system">System</option>
            </select>
          </div>
          <div className="studio-row">
            <div>
              <strong>First day of week</strong>
              <p className="studio-muted">用于内容日历。</p>
            </div>
            <select
              aria-label="First day of week"
              value={data.weekStart}
              onChange={(e) =>
                update((current) => ({
                  ...current,
                  weekStart: e.target.value as typeof current.weekStart,
                }))
              }
            >
              <option value="monday">Monday</option>
              <option value="sunday">Sunday</option>
            </select>
          </div>
          <div className="studio-row">
            <div>
              <strong>Editor text direction</strong>
              <p className="studio-muted">用于写作编辑器。</p>
            </div>
            <select
              aria-label="Editor text direction"
              value={data.textDirection}
              onChange={(e) =>
                update((current) => ({
                  ...current,
                  textDirection: e.target.value as typeof current.textDirection,
                }))
              }
            >
              <option value="ltr">Left to right</option>
              <option value="rtl">Right to left</option>
            </select>
          </div>
          <div className="studio-row">
            <span>Show scrollbars</span>
            <input
              type="checkbox"
              checked={data.showScrollbars}
              onChange={(e) =>
                update((current) => ({
                  ...current,
                  showScrollbars: e.target.checked,
                }))
              }
            />
          </div>
          <div className="studio-row">
            <span>Show quote connections</span>
            <input
              type="checkbox"
              checked={data.showQuoteConnections}
              onChange={(e) =>
                update((current) => ({
                  ...current,
                  showQuoteConnections: e.target.checked,
                }))
              }
            />
          </div>
        </section>
      )}
      {tab === "Billing" && (
        <>
          <p className="studio-muted">
            演示数据 ·
            以下操作只改变此浏览器中的界面状态，不会产生收费或取消真实订阅。
          </p>
          <h2>Subscription</h2>
          <section className="studio-card">
            <div className="studio-row">
              <div>
                <strong>
                  Signal Agent Advanced ·{" "}
                  {data.billingDemoCanceled ? "将结束" : "Trial"}
                </strong>
                <p className="studio-muted">
                  $49.00 / month ·{" "}
                  {data.billingDemoCanceled
                    ? "访问截至 15 Oct, 2026"
                    : "Renews on 15 Oct, 2026"}
                </p>
              </div>
              <button
                className="studio-secondary"
                onClick={() => setCancelStep("offer")}
              >
                Change plan
              </button>
            </div>
            <div className="studio-row">
              <div>
                <strong>Payment method</strong>
                <p className="studio-muted">演示账单门户</p>
              </div>
              <button
                className="studio-link"
                onClick={() => window.alert("演示模式：支付方式不可更改。")}
              >
                Update
              </button>
            </div>
            <div className="studio-row">
              <div>
                <strong>Billing details</strong>
                <p className="studio-muted">公司名称与税号</p>
              </div>
              <button
                className="studio-link"
                onClick={() => window.alert("演示模式：账单信息不可更改。")}
              >
                Edit
              </button>
            </div>
          </section>
          <h2>Invoices</h2>
          <section className="studio-card">
            <div className="studio-row">
              <span>12 Oct, 2026</span>
              <span>$0.00</span>
              <span>Paid · 演示</span>
            </div>
          </section>
          {!data.billingDemoCanceled && (
            <p className="studio-muted">
              No longer need Signal Agent?{" "}
              <button
                className="studio-link danger"
                onClick={() => setCancelStep("offer")}
              >
                Cancel subscription
              </button>
            </p>
          )}
          {data.billingDemoCanceled && (
            <button
              className="studio-link"
              onClick={() =>
                update((current) => ({
                  ...current,
                  billingDemoCanceled: false,
                }))
              }
            >
              恢复演示订阅
            </button>
          )}
          {cancelStep && (
            <div className="studio-modal-backdrop">
              <dialog
                open
                className="studio-modal"
                aria-modal="true"
                aria-label="Cancel subscription"
              >
                <h2>
                  {cancelStep === "offer"
                    ? "How about 50% off for 3 months?"
                    : "Confirm cancellation"}
                </h2>
                <p>
                  {cancelStep === "offer"
                    ? "演示优惠：$24.50 / month for 3 months。"
                    : "演示订阅将在 15 Oct, 2026 结束。此操作不会影响真实账单。"}
                </p>
                <div className="studio-actions">
                  <button
                    className="studio-secondary"
                    onClick={() => setCancelStep(null)}
                  >
                    {cancelStep === "offer" ? "保留订阅" : "返回"}
                  </button>
                  {cancelStep === "offer" ? (
                    <button
                      className="studio-primary"
                      onClick={() => setCancelStep("confirm")}
                    >
                      继续取消
                    </button>
                  ) : (
                    <button
                      className="studio-link danger"
                      onClick={() => {
                        update((current) => ({
                          ...current,
                          billingDemoCanceled: true,
                        }));
                        setCancelStep(null);
                      }}
                    >
                      确认取消演示订阅
                    </button>
                  )}
                </div>
              </dialog>
            </div>
          )}
        </>
      )}
      {tab === "Team & Permissions" && (
        <section className="studio-card">
          <h2>Team & Permissions</h2>
          <p className="studio-muted">团队成员与权限沿用现有组织系统。</p>
          <Link className="studio-secondary" to="/members">
            管理团队成员
          </Link>
        </section>
      )}
      {tab === "Context" && (
        <section className="studio-card">
          <h2>Context</h2>
          <p className="studio-muted">编辑关于你、写作风格、产品和兴趣。</p>
          <Link className="studio-secondary" to="/context">
            打开 Context
          </Link>
        </section>
      )}
      {tab === "API / MCP / CLI" && (
        <section className="studio-card">
          <h2>API / MCP / CLI</h2>
          <p className="studio-muted">
            当前版本尚未提供公开 API 密钥、CLI 或 MCP 连接。请勿把 X
            登录令牌复制给外部工具。
          </p>
        </section>
      )}
      {error && (
        <p className="studio-alert" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
