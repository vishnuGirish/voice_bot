"use client";

import { useRouter } from "next/navigation";
import type { SessionPayload } from "@/lib/auth";

export default function Topbar({ session }: { session: SessionPayload }) {
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-800 px-6">
      <div />
      <div className="flex items-center gap-3">
        <div className="text-right">
          <p className="text-sm font-medium text-zinc-100">{session.name}</p>
          <p className="text-[11px] text-zinc-500">{session.role}</p>
        </div>
        <button
          onClick={logout}
          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
        >
          Log out
        </button>
      </div>
    </header>
  );
}
