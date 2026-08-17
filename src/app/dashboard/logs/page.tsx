import { prisma } from "@/lib/db";
import Badge from "@/components/Badge";
import type { LogCategory } from "@prisma/client";

const CATEGORIES: LogCategory[] = ["AUTH", "HRMS", "CRM", "PROJECTS", "ACCOUNTING", "SYSTEM"];

const categoryColor: Record<LogCategory, "blue" | "green" | "purple" | "yellow" | "gray"> = {
  AUTH: "gray",
  HRMS: "green",
  CRM: "blue",
  PROJECTS: "purple",
  ACCOUNTING: "yellow",
  SYSTEM: "gray",
};

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; actor?: string }>;
}) {
  const { category, actor } = await searchParams;

  const logs = await prisma.activityLog.findMany({
    where: {
      category: category && CATEGORIES.includes(category as LogCategory) ? (category as LogCategory) : undefined,
      actorName: actor ? { contains: actor, mode: "insensitive" } : undefined,
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-white">Activity Logs</h1>
        <p className="text-sm text-zinc-500">Every action taken across the ERP — logins, attendance, deals, tasks, invoices.</p>
      </div>

      <form className="flex flex-wrap items-center gap-2">
        <a
          href="/dashboard/logs"
          className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
            !category ? "bg-sky-500/20 text-sky-300" : "border border-zinc-700 text-zinc-400 hover:bg-zinc-800"
          }`}
        >
          All
        </a>
        {CATEGORIES.map((c) => (
          <a
            key={c}
            href={`/dashboard/logs?category=${c}${actor ? `&actor=${actor}` : ""}`}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
              category === c ? "bg-sky-500/20 text-sky-300" : "border border-zinc-700 text-zinc-400 hover:bg-zinc-800"
            }`}
          >
            {c}
          </a>
        ))}
        <input
          type="text"
          name="actor"
          defaultValue={actor}
          placeholder="Filter by person…"
          className="ml-auto rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-white outline-none focus:border-sky-500"
        />
        {category && <input type="hidden" name="category" value={category} />}
        <button className="rounded-lg bg-sky-500/15 px-3 py-1.5 text-xs text-sky-300 hover:bg-sky-500/25">
          Filter
        </button>
      </form>

      <div className="overflow-hidden rounded-xl border border-zinc-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-900/80 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-3 font-medium">When</th>
              <th className="px-4 py-3 font-medium">Who</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {logs.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-zinc-500">
                  No activity recorded yet.
                </td>
              </tr>
            )}
            {logs.map((log) => (
              <tr key={log.id} className="bg-zinc-950/40 hover:bg-zinc-900/60">
                <td className="whitespace-nowrap px-4 py-3 text-xs text-zinc-500">
                  {log.createdAt.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-zinc-200">{log.actorName}</td>
                <td className="px-4 py-3">
                  <Badge text={log.category} color={categoryColor[log.category]} />
                </td>
                <td className="px-4 py-3 text-zinc-300">{log.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
