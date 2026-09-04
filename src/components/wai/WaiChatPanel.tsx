"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { useWaiChat } from "@/lib/wai/useWaiChat";

export default function WaiChatPanel({
  apiKey,
  userId,
  companyId,
  organizationId,
}: { apiKey?: string; userId?: string; companyId?: string; organizationId?: string } = {}) {
  const { messages, sending, send } = useWaiChat({ apiKey, userId, companyId, organizationId });
  const [input, setInput] = useState("");

  async function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setInput("");
    await send(trimmed);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="text-sm text-zinc-300">
            Hello — how can I help? Ask me anything about your data.
          </p>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                m.role === "user" ? "bg-sky-500 text-white" : "bg-zinc-800 text-zinc-100"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}

        {sending && (
          <div className="flex justify-start">
            <div className="rounded-xl bg-zinc-800 px-3 py-2 text-sm text-zinc-400">Thinking…</div>
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
        className="flex items-center gap-2 border-t border-zinc-800 p-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask WAI anything…"
          className="flex-1 rounded-full border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-white outline-none focus:border-sky-500"
        />
        <button
          type="submit"
          disabled={sending}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-500 text-white disabled:opacity-50"
        >
          <Send size={15} />
        </button>
      </form>
    </div>
  );
}
