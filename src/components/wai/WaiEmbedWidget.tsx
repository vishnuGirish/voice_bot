"use client";

import { Sparkles } from "lucide-react";
import WaiChatPanel from "./WaiChatPanel";

export default function WaiEmbedWidget({ apiKey, userId }: { apiKey: string; userId?: string }) {
  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-zinc-950 text-zinc-100">
      <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-indigo-500">
          <Sparkles size={15} className="text-white" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white">WAI</p>
          <p className="text-[11px] text-zinc-500">Team assistant &amp; guidance</p>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <WaiChatPanel apiKey={apiKey} userId={userId} />
      </div>
    </div>
  );
}
