"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, PhoneOff } from "lucide-react";

const INPUT_SAMPLE_RATE = 48000;
const OUTPUT_SAMPLE_RATE = 24000;
// Agent settings (models, prompt, and function/tool definitions) are sent by
// the server (server.js) as soon as it connects upstream to Deepgram — the
// server is what actually executes tool calls against Postgres, so it owns
// the Settings payload. The client only streams audio.

type Bubble = { role: "user" | "assistant"; content: string };

export default function WaiVoicePanel({
  apiKey,
  organizationId,
  userId,
  companyId,
}: {
  apiKey?: string;
  organizationId?: string;
  userId?: string;
  companyId?: string;
} = {}) {
  const [messages, setMessages] = useState<Bubble[]>([]);
  const [active, setActive] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [muted, setMuted] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const mutedRef = useRef(false);
  const nextPlayTimeRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  function floatTo16BitPCM(input: Float32Array) {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return output;
  }

  function playAgentAudio(buffer: ArrayBuffer) {
    const ctx = outputCtxRef.current;
    if (!ctx) return;
    const int16 = new Int16Array(buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 0x8000;

    const audioBuffer = ctx.createBuffer(1, float32.length, OUTPUT_SAMPLE_RATE);
    audioBuffer.copyToChannel(float32, 0);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);

    const startAt = Math.max(ctx.currentTime, nextPlayTimeRef.current);
    source.start(startAt);
    nextPlayTimeRef.current = startAt + audioBuffer.duration;

    setSpeaking(true);
    source.onended = () => {
      if (ctx.currentTime >= nextPlayTimeRef.current - 0.05) setSpeaking(false);
    };
  }

  function handleServerEvent(event: MessageEvent) {
    if (typeof event.data === "string") {
      let msg: { type?: string; role?: string; content?: string; message?: string };
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (msg.type === "ConversationText" && msg.content) {
        setMessages((prev) => [...prev, { role: msg.role === "user" ? "user" : "assistant", content: msg.content! }]);
      } else if (msg.type === "Error") {
        setError(msg.message || "Voice agent reported an error.");
      }
      return;
    }
    // binary = agent speech audio (arraybuffer)
    playAgentAudio(event.data as ArrayBuffer);
  }

  async function startCall() {
    setError(null);
    setConnecting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, sampleRate: INPUT_SAMPLE_RATE },
      });
      streamRef.current = stream;

      const inputCtx = new AudioContext({ sampleRate: INPUT_SAMPLE_RATE });
      inputCtxRef.current = inputCtx;
      const outputCtx = new AudioContext({ sampleRate: OUTPUT_SAMPLE_RATE });
      outputCtxRef.current = outputCtx;
      nextPlayTimeRef.current = 0;

      const proto = location.protocol === "https:" ? "wss" : "ws";
      const params = new URLSearchParams();
      if (apiKey) params.set("key", apiKey);
      if (organizationId) params.set("organizationId", organizationId);
      if (userId) params.set("userId", userId);
      if (companyId) params.set("companyId", companyId);
      const query = params.toString() ? `?${params.toString()}` : "";
      const ws = new WebSocket(`${proto}://${location.host}/wai-voice${query}`);
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      ws.onopen = () => {
        const source = inputCtx.createMediaStreamSource(stream);
        const processor = inputCtx.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;
        const silentGain = inputCtx.createGain();
        silentGain.gain.value = 0;

        processor.onaudioprocess = (e) => {
          if (mutedRef.current || ws.readyState !== WebSocket.OPEN) return;
          const pcm = floatTo16BitPCM(e.inputBuffer.getChannelData(0));
          ws.send(pcm.buffer);
        };

        source.connect(processor);
        processor.connect(silentGain);
        silentGain.connect(inputCtx.destination);

        setActive(true);
        setConnecting(false);
      };

      ws.onmessage = handleServerEvent;
      ws.onerror = () => setError("Couldn't connect to the voice service. Check your connection and try again.");
      ws.onclose = () => {
        setActive(false);
        setConnecting(false);
      };
    } catch {
      setError("Couldn't access your microphone. Check browser permissions and try again.");
      setConnecting(false);
    }
  }

  function endCall() {
    wsRef.current?.close();
    wsRef.current = null;
    processorRef.current?.disconnect();
    processorRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    inputCtxRef.current?.close();
    inputCtxRef.current = null;
    outputCtxRef.current?.close();
    outputCtxRef.current = null;
    setActive(false);
    setSpeaking(false);
  }

  function toggleMute() {
    mutedRef.current = !mutedRef.current;
    setMuted(mutedRef.current);
  }

  useEffect(() => {
    return () => {
      wsRef.current?.close();
      processorRef.current?.disconnect();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      inputCtxRef.current?.close();
      outputCtxRef.current?.close();
    };
  }, []);

  return (
    <div className="flex h-full flex-col items-center">
      <div className="flex w-full items-center justify-between px-4 pt-3">
        <span className="text-[11px] text-zinc-500">WAI Voice — Deepgram live agent</span>
        <span className="rounded-md border border-zinc-700 px-2 py-1 text-[11px] text-zinc-400">English</span>
      </div>

      <div ref={scrollRef} className="w-full flex-1 space-y-2 overflow-y-auto px-4 py-3">
        {messages.length === 0 && (
          <p className="mt-6 text-center text-xs text-zinc-500">
            Tap start and talk — WAI will greet you and respond out loud.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-xl px-3 py-2 text-xs ${
                m.role === "user" ? "bg-sky-500 text-white" : "bg-zinc-800 text-zinc-100"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
      </div>

      {error && <p className="px-4 pb-2 text-center text-[11px] text-red-400">{error}</p>}

      <div className="flex flex-col items-center gap-3 pb-6 pt-2">
        <button
          onClick={active ? undefined : startCall}
          disabled={connecting || active}
          className={`flex h-16 w-16 items-center justify-center rounded-full border-2 transition-colors ${
            speaking
              ? "border-sky-400 bg-sky-500/20"
              : active
              ? "border-emerald-400 bg-emerald-500/10 cursor-default"
              : "border-zinc-700 bg-zinc-900 hover:border-sky-500 hover:bg-sky-500/10 disabled:opacity-60"
          }`}
        >
          <span className="text-xs font-semibold text-white">WAI</span>
        </button>
        <p className="text-[11px] text-zinc-500">
          {connecting ? "Connecting…" : speaking ? "Speaking…" : active ? "Listening…" : "Tap to start"}
        </p>

        {active && (
          <div className="flex items-center gap-3">
            <button
              onClick={toggleMute}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            >
              {muted ? <MicOff size={17} /> : <Mic size={17} />}
            </button>
            <button
              onClick={endCall}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-400"
            >
              <PhoneOff size={17} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
