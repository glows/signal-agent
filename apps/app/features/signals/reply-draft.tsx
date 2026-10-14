import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { trpcClient } from "#lib/trpc";
interface Draft {
  text: string;
  tone: "professional" | "friendly" | "concise";
  thoughts: string;
  updatedAt: string;
}
export function ReplyDraft({
  id,
  name,
  sourceUrl,
  saved,
}: {
  id: string;
  name: string;
  sourceUrl?: string;
  saved?: Draft;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(saved?.text ?? "");
  const [tone, setTone] = useState<Draft["tone"]>(
    saved?.tone ?? "professional",
  );
  const [thoughts, setThoughts] = useState(saved?.thoughts ?? "");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [replace, setReplace] = useState(false);
  const queryClient = useQueryClient();
  const generate = useMutation({
    mutationFn: () =>
      trpcClient.acquisition.generateReply.mutate({ id, tone, thoughts }),
    onSuccess: (result) => {
      setText(result.text);
      setMessage("模板草稿已生成，尚未保存。请核对原帖后编辑。");
      setReplace(false);
    },
    onError: (e) => setError(e.message),
  });
  const save = useMutation({
    mutationFn: () =>
      trpcClient.acquisition.saveReply.mutate({ id, text, tone, thoughts }),
    onSuccess: () => {
      setMessage("草稿已保存，尚未发布。");
      void queryClient.invalidateQueries({ queryKey: ["acquisition"] });
    },
    onError: (e) => setError(e.message),
  });
  const pending = generate.isPending || save.isPending;
  function requestGeneration() {
    setError("");
    setMessage("");
    if (text.trim()) {
      setReplace(true);
      return;
    }
    generate.mutate();
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setMessage("已复制。请前往 X 原帖，审核后粘贴发布。");
      setError("");
    } catch {
      setError("无法访问剪贴板，请选中草稿文字手动复制。");
    }
  }
  return (
    <section className="reply-draft">
      <button
        className="secondary-button"
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {saved ? "编辑回复草稿" : "准备回复草稿"}
      </button>
      {open && (
        <div className="reply-editor">
          <h3>给 {name} 的回复草稿</h3>
          <p>模板生成 · 不调用 AI 或 X 写入接口 · 由你审核后发布</p>
          <label>
            语气
            <select
              disabled={pending}
              value={tone}
              onChange={(e) => {
                const value = e.target.value;
                if (
                  value === "professional" ||
                  value === "friendly" ||
                  value === "concise"
                )
                  setTone(value);
              }}
            >
              <option value="professional">专业</option>
              <option value="friendly">友好</option>
              <option value="concise">简洁</option>
            </select>
          </label>
          <label>
            我的想法（可选）
            <textarea
              disabled={pending}
              value={thoughts}
              maxLength={1000}
              onChange={(e) => setThoughts(e.target.value)}
              placeholder="补充你真正想说的话，避免虚构产品能力或承诺。"
            />
          </label>
          <button
            type="button"
            className="secondary-button"
            disabled={pending}
            onClick={requestGeneration}
          >
            {generate.isPending ? "生成中…" : "生成草稿"}
          </button>
          {replace && (
            <div className="reply-replace">
              <p>
                重新生成会替换编辑器中的文字，数据库里的已保存草稿不受影响。
              </p>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setReplace(false)}
              >
                保留当前文字
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={pending}
                onClick={() => generate.mutate()}
              >
                替换并生成
              </button>
            </div>
          )}
          <label>
            回复内容
            <textarea
              disabled={pending}
              value={text}
              maxLength={2000}
              onChange={(e) => {
                setText(e.target.value);
                setMessage("");
              }}
              rows={6}
            />
          </label>
          <small>{Array.from(text).length} 个字符 · X 发布限制以原站为准</small>
          <div className="brief-actions">
            <button
              type="button"
              className="primary-button"
              disabled={pending || !text.trim()}
              onClick={() => {
                setError("");
                save.mutate();
              }}
            >
              {save.isPending ? "保存中…" : "保存草稿"}
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={!text.trim() || pending}
              onClick={() => void copy()}
            >
              复制回复
            </button>
            {sourceUrl && (
              <a href={sourceUrl} target="_blank" rel="noopener noreferrer">
                前往 X 原帖 ↗
              </a>
            )}
          </div>
          {message && <output>{message}</output>}
          {error && <p role="alert">{error}</p>}
        </div>
      )}
    </section>
  );
}
