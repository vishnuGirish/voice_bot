"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navItems } from "@/lib/nav";

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900/60 p-4 sm:flex">
      <div className="mb-6 flex items-center gap-2 px-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 to-indigo-500 text-sm font-bold text-white">
          PD
        </div>
        <div>
          <p className="text-sm font-semibold text-white">Digitalize</p>
          <p className="text-[11px] text-zinc-500">One smart ERP</p>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {navItems.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                active
                  ? "bg-sky-500/15 text-sky-300"
                  : "text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-100"
              }`}
            >
              <Icon size={17} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-xs text-zinc-500">
        Ask <span className="font-medium text-sky-400">WAI</span> anything about
        your team, sales, projects or finances — bottom right.
      </div>
    </aside>
  );
}
