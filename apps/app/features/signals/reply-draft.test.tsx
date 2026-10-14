import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

import { ReplyDraft } from "./reply-draft";
const api = vi.hoisted(() => ({ generate: vi.fn(), save: vi.fn() }));
vi.mock("#lib/trpc", () => ({
  trpcClient: {
    acquisition: {
      generateReply: { mutate: api.generate },
      saveReply: { mutate: api.save },
    },
  },
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
function mount() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ReplyDraft
        id="lead"
        name="Buyer"
        sourceUrl="https://x.com/buyer/status/1"
        saved={{
          text: "My reviewed reply",
          tone: "friendly",
          thoughts: "My idea",
          updatedAt: "2026-10-14",
        }}
      />
    </QueryClientProvider>,
  );
}
it("protects edits before regeneration and saves the exact reviewed text", async () => {
  api.generate.mockResolvedValue({
    text: "Generated reply",
    method: "template",
  });
  api.save.mockResolvedValue({ saved: true });
  mount();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "编辑回复草稿" }));
  await user.click(screen.getByRole("button", { name: "生成草稿" }));
  expect(api.generate).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "保留当前文字" }));
  const text = screen.getByLabelText("回复内容");
  await user.clear(text);
  await user.type(text, "Edited by me");
  await user.click(screen.getByRole("button", { name: "保存草稿" }));
  await screen.findByText("草稿已保存，尚未发布。");
  expect(api.save).toHaveBeenCalledWith({
    id: "lead",
    text: "Edited by me",
    tone: "friendly",
    thoughts: "My idea",
  });
  expect(screen.getByRole("link", { name: "前往 X 原帖 ↗" })).toHaveAttribute(
    "href",
    "https://x.com/buyer/status/1",
  );
});
it("only replaces the text after explicit confirmation", async () => {
  api.generate.mockResolvedValue({
    text: "Generated reply",
    method: "template",
  });
  mount();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "编辑回复草稿" }));
  await user.click(screen.getByRole("button", { name: "生成草稿" }));
  await user.click(screen.getByRole("button", { name: "替换并生成" }));
  await screen.findByDisplayValue("Generated reply");
  expect(api.save).not.toHaveBeenCalled();
});
