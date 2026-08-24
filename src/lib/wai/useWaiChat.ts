"use client";

import { useCallback, useState } from "react";

export type ChatMsg = { role: "user" | "assistant"; content: string };

export function useWaiChat(apiKey?: string, userId?: string) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [sending, setSending] = useState(false);

  const send = useCallback(
    async (text: string): Promise<string> => {
      const next: ChatMsg[] = [...messages, { role: "user", content: text }];
      setMessages(next);
      setSending(true);
      try {
        const res = await fetch("/api/wai/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(apiKey ? { "X-WAI-Api-Key": apiKey } : {}),
          },
          body: JSON.stringify({ messages: next, userId }),
        });
        const data = await res.json();
        const reply: string = res.ok
          ? data.reply
          : data.error || "Something went wrong talking to WAI.";
        setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
        return reply;
      } finally {
        setSending(false);
      }
    },
    [messages, apiKey, userId]
  );

  return { messages, sending, send };
}
