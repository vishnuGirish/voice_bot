import { prisma } from "@/lib/db";
import StatCard from "@/components/StatCard";
import { Users, TrendingUp, Briefcase, Wallet, CalendarCheck, AlertCircle } from "lucide-react";

export default async function OverviewPage() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [staffCount, presentToday, openLeads, activeProjects, pendingLeaves, invoicesOutstanding] =
    await Promise.all([
      prisma.staff.count({ where: { active: true } }),
      prisma.attendance.count({ where: { date: today, status: { in: ["PRESENT", "LATE", "WORK_FROM_HOME"] } } }),
      prisma.lead.count({ where: { stage: { notIn: ["WON", "LOST"] } } }),
      prisma.project.count({ where: { status: "ACTIVE" } }),
      prisma.leave.count({ where: { status: "PENDING" } }),
      prisma.invoice.aggregate({
        where: { status: { in: ["SENT", "OVERDUE"] } },
        _sum: { amount: true },
      }),
    ]);

  const recentLeads = await prisma.lead.findMany({
    orderBy: { updatedAt: "desc" },
    take: 5,
    include: { client: true },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-white">Overview</h1>
        <p className="text-sm text-zinc-500">Snapshot of your business right now.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Active staff" value={staffCount} icon={Users} />
        <StatCard label="Present today" value={presentToday} icon={CalendarCheck} />
        <StatCard label="Open leads" value={openLeads} icon={TrendingUp} />
        <StatCard label="Active projects" value={activeProjects} icon={Briefcase} />
        <StatCard label="Pending leave requests" value={pendingLeaves} icon={AlertCircle} />
        <StatCard
          label="Outstanding invoices"
          value={`₹${Number(invoicesOutstanding._sum.amount ?? 0).toLocaleString("en-IN")}`}
          icon={Wallet}
        />
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
        <h2 className="mb-3 text-sm font-medium text-zinc-300">Recent sales pipeline activity</h2>
        <div className="space-y-2">
          {recentLeads.length === 0 && <p className="text-sm text-zinc-500">No leads yet.</p>}
          {recentLeads.map((lead) => (
            <div key={lead.id} className="flex items-center justify-between rounded-lg bg-zinc-950/40 px-3 py-2 text-sm">
              <div>
                <p className="text-zinc-100">{lead.title}</p>
                <p className="text-xs text-zinc-500">{lead.client?.name ?? "No client"}</p>
              </div>
              <span className="text-xs text-sky-400">{lead.stage}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
