import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SignalWorkspace } from "./workspace";

const calls = vi.hoisted(() => ({
  connection: vi.fn(),
  discover: vi.fn(),
  linkSocial: vi.fn(),
  signIn: vi.fn(),
}));
vi.mock("#lib/auth", () => ({
  auth: { linkSocial: calls.linkSocial, signIn: { social: calls.signIn } },
}));
vi.mock("#lib/trpc", () => ({
  trpcClient: {
    signals: {
      connection: { query: calls.connection },
      discover: { mutate: calls.discover },
    },
  },
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

beforeEach(() => {
  localStorage.clear();
  calls.linkSocial.mockReset().mockResolvedValue({ data: { redirect: true } });
  calls.signIn.mockReset().mockResolvedValue({ data: { redirect: true } });
  calls.connection.mockReset().mockResolvedValue({
    configured: true,
    allowed: true,
    userId: "user-a",
    maxPostsPerRun: 30,
  });
  calls.discover.mockReset().mockImplementation(async (input) => ({
    leads: [
      {
        id: `${input.id}:x-1`,
        agentId: input.id,
        score: 90,
        rationale: "匹配 SaaS 需求",
        dataSource: "x",
        discoveredAt: new Date().toISOString(),
        feedback: "pending",
        person: {
          id: "x-1",
          username: "buyer",
          displayName: "真实测试线索",
          bio: "SaaS buyer",
          followers: 12,
          posts: ["Need AI"],
          lists: [],
          interactions: [],
        },
        provenance: {
          signalType: "keyword",
          source: "Need AI",
          interaction: "命中 X 搜索条件",
          postUrl: "https://x.com/buyer/status/1",
        },
      },
    ],
    postsScanned: 1,
    candidatesScored: 1,
    checkedAt: new Date().toISOString(),
  }));
});
afterEach(cleanup);

async function createLiveAgent() {
  const user = userEvent.setup();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <SignalWorkspace userId="user-a" />
    </QueryClientProvider>,
  );
  await user.click(screen.getByRole("button", { name: "真实 X 数据" }));
  await screen.findByText("真实 X 数据已就绪");
  await user.click(screen.getByRole("button", { name: /^创建 Agent$/ }));
  const form = within(screen.getByRole("dialog"));
  await user.type(
    form.getByRole("textbox", { name: /Agent 名称/ }),
    "Real buyers",
  );
  await user.type(
    form.getByRole("textbox", { name: /理想客户画像/ }),
    "AI SaaS founders",
  );
  await user.type(form.getByPlaceholderText("输入关键词，例如 AI"), "AI");
  await user.click(form.getByRole("button", { name: "添加" }));
  await user.click(form.getByRole("button", { name: /^创建 Agent$/ }));
  return user;
}

describe("real data workflow", () => {
  it("starts user OAuth linking without accepting a token in the browser", async () => {
    calls.connection.mockResolvedValue({
      configured: true,
      allowed: false,
      connected: false,
      userId: "user-a",
      maxPostsPerRun: 30,
    });
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SignalWorkspace userId="user-a" />
      </QueryClientProvider>,
    );
    await user.click(await screen.findByRole("button", { name: "连接 X" }));
    expect(calls.linkSocial).toHaveBeenCalledWith({
      provider: "twitter",
      callbackURL: `${window.location.origin}/signals`,
    });
    expect(calls.discover).not.toHaveBeenCalled();
  });
  it("runs the backend connector, preserves feedback and isolates demo data", async () => {
    const user = await createLiveAgent();
    await user.click(screen.getByRole("button", { name: "运行一次" }));
    await screen.findByText("读取 1 条 X 帖子，新增 1 条线索");
    expect(calls.discover).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Real buyers",
        signals: [{ type: "keyword", value: "AI" }],
      }),
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "真实测试线索 的反馈" }),
      "fit",
    );
    await user.click(screen.getByRole("button", { name: "运行一次" }));
    await screen.findByText("读取 1 条 X 帖子，新增 0 条线索");
    expect(
      screen.getByRole("combobox", { name: "真实测试线索 的反馈" }),
    ).toHaveValue("fit");
    await user.click(screen.getByRole("button", { name: "演示数据" }));
    expect(screen.queryByText("真实测试线索")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "真实 X 数据" }));
    expect(
      screen.getByRole("combobox", { name: "真实测试线索 的反馈" }),
    ).toHaveValue("fit");
  });

  it("shows connector errors without creating false leads", async () => {
    const user = await createLiveAgent();
    calls.discover.mockRejectedValueOnce(new Error("X 接口限流"));
    await user.click(screen.getByRole("button", { name: "运行一次" }));
    await screen.findByText("X 接口限流");
    expect(screen.queryByText("真实测试线索")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "运行一次" })).toBeEnabled();
  });
});

it("defaults to utility and restores the chosen workspace theme", async () => {
  const user = userEvent.setup();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = () => (
    <QueryClientProvider client={client}>
      <SignalWorkspace />
    </QueryClientProvider>
  );
  const first = render(view());
  expect(
    first.container.querySelector(".app-shell")?.getAttribute("data-design"),
  ).toBe("utility");
  await user.click(screen.getByRole("button", { name: "数据设置" }));
  await user.click(screen.getByRole("button", { name: /自然浅绿/ }));
  expect(
    first.container.querySelector(".app-shell")?.getAttribute("data-design"),
  ).toBe("nature");
  first.unmount();
  const second = render(view());
  expect(
    second.container.querySelector(".app-shell")?.getAttribute("data-design"),
  ).toBe("nature");
  await user.click(screen.getByRole("button", { name: "数据设置" }));
  await user.click(screen.getByRole("button", { name: /工具工作台/ }));
  expect(
    second.container.querySelector(".app-shell")?.getAttribute("data-design"),
  ).toBe("utility");
});

it("applies the selected design to the portaled Agent form", async () => {
  const user = userEvent.setup();
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <SignalWorkspace />
    </QueryClientProvider>,
  );
  await user.click(screen.getByRole("button", { name: /^创建 Agent$/ }));
  expect(screen.getByRole("dialog").getAttribute("data-design")).toBe(
    "utility",
  );
});
