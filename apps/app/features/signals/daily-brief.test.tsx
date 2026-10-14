import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { DailyBrief } from "./daily-brief";
const api = vi.hoisted(() => ({
  state: vi.fn(),
  save: vi.fn(),
  review: vi.fn(),
  run: vi.fn(),
}));
vi.mock("#lib/trpc", () => ({
  trpcClient: {
    acquisition: {
      state: { query: api.state },
      save: { mutate: api.save },
      review: { mutate: api.review },
      run: { mutate: api.run },
    },
  },
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <DailyBrief />
    </QueryClientProvider>,
  );
}
it("requires a saved target and persists the configured daily workflow", async () => {
  api.state.mockResolvedValue(null);
  api.save.mockResolvedValue({ saved: true });
  mount();
  const user = userEvent.setup();
  await screen.findByRole("heading", { name: "从你的产品开始" });
  expect(screen.getByRole("button", { name: "立即发现" })).toBeDisabled();
  await user.click(screen.getAllByRole("button", { name: "配置获客目标" })[0]);
  await user.type(
    screen.getByLabelText("产品与解决的问题"),
    "CRM for small teams",
  );
  await user.type(
    screen.getByLabelText("理想客户与需求"),
    "SaaS founders seeking CRM",
  );
  await user.type(screen.getByLabelText("来源 1", { exact: true }), "need CRM");
  await user.click(screen.getByRole("checkbox"));
  await user.click(screen.getByRole("button", { name: "保存配置" }));
  await vi.waitFor(() =>
    expect(api.save).toHaveBeenCalledWith(
      expect.objectContaining({
        product: "CRM for small teams",
        enabled: true,
        dailyLimit: 30,
      }),
    ),
  );
});
it("shows a 402 failure and allows an explicit contact review without sending a message", async () => {
  api.state.mockResolvedValue({
    product: "CRM",
    enabled: false,
    nextRunAt: new Date().toISOString(),
    dailyLimit: 30,
    leaseUntil: null,
    leads: [
      {
        id: "lead",
        review: "new",
        score: 90,
        person: { displayName: "Buyer", username: "buyer" },
        rationale: "CRM need",
        suggestion: "Ask about current process",
        provenance: {
          source: "Need CRM",
          postUrl: "https://x.com/buyer/status/1",
        },
        discoveredAt: new Date().toISOString(),
      },
    ],
    runs: [
      {
        id: "run",
        startedAt: new Date().toISOString(),
        status: "failed",
        trigger: "daily",
        scanned: 30,
        message: "X API 402 Credits",
      },
    ],
  });
  api.review.mockResolvedValue({ saved: true });
  mount();
  const user = userEvent.setup();
  await screen.findByText("CRM need");
  expect(screen.getByText("X API 402 Credits")).toBeInTheDocument();
  await user.selectOptions(
    screen.getByLabelText("Buyer 的审核状态"),
    "contacted",
  );
  await vi.waitFor(() =>
    expect(api.review).toHaveBeenCalledWith({
      id: "lead",
      review: "contacted",
    }),
  );
  expect(api.run).not.toHaveBeenCalled();
});
