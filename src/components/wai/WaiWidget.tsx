"use client";

import { useState } from "react";
import { Sparkles, X, Phone } from "lucide-react";
import WaiChatPanel from "./WaiChatPanel";
import WaiVoicePanel from "./WaiVoicePanel";

export default function WaiWidget() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"chat" | "voice">("voice");

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
        <div
          onClick={(e) => e.stopPropagation()}
          className="flex h-[min(80vh,760px)] w-[min(92vw,520px)] flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl"
        >
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
            <div className="flex items-center gap-1">
              <button
                onClick={() => setMode(mode === "chat" ? "voice" : "chat")}
                className={`rounded-lg px-2 py-1 text-[11px] font-medium ${
                  mode === "voice" ? "bg-sky-500/20 text-sky-300" : "text-zinc-400 hover:bg-zinc-800"
                }`}
                title="Toggle voice mode"
              >
                <Phone size={14} />
              </button>
              <button onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800">
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-hidden">
            {mode === "chat" ? <WaiChatPanel /> : <WaiVoicePanel />}
          </div>
          {/* Note: this floating widget always uses the logged-in dashboard session. */}
        </div>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-indigo-500 text-white shadow-xl transition-transform hover:scale-105"
      >
        {open ? <X size={22} /> : <Sparkles size={22} />}
      </button>
    </>
  );
}
