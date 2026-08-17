"use client";

import { useState } from "react";
import { Sparkles, Phone, MessageSquare } from "lucide-react";
import WaiChatPanel from "./WaiChatPanel";
import WaiVoicePanel from "./WaiVoicePanel";

export default function WaiEmbedWidget({ apiKey }: { apiKey: string }) {
  const [mode, setMode] = useState<"chat" | "voice">("chat");

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-zinc-950 text-zinc-100">
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-indigo-500">
            <Sparkles size={15} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">WAI</p>
            <p className="text-[11px] text-zinc-500">Team assistant &amp; guidance</p>
          </div>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-zinc-800 p-0.5">
          <button
            onClick={() => setMode("chat")}
            className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium ${
              mode === "chat" ? "bg-sky-500/20 text-sky-300" : "text-zinc-400 hover:bg-zinc-800"
            }`}
          >
            <MessageSquare size={12} /> Chat
          </button>
          <button
            onClick={() => setMode("voice")}
            className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium ${
              mode === "voice" ? "bg-sky-500/20 text-sky-300" : "text-zinc-400 hover:bg-zinc-800"
            }`}
          >
            <Phone size={12} /> Voice
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {mode === "chat" ? <WaiChatPanel apiKey={apiKey} /> : <WaiVoicePanel apiKey={apiKey} />}
      </div>
    </div>
  );
}
