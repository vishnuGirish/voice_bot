import { prisma } from "@/lib/db";
import DataTable from "@/components/DataTable";
import Badge from "@/components/Badge";
import { markAttendance, updateLeaveStatus, addStaff } from "./actions";
import type { AttendanceStatus } from "@prisma/client";
import { requireSession } from "@/lib/auth";

function today() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

const attendanceColor: Record<string, "green" | "red" | "yellow" | "blue" | "gray"> = {
  PRESENT: "green",
  LATE: "yellow",
  ABSENT: "red",
  ON_LEAVE: "blue",
  WORK_FROM_HOME: "blue",
};

const ATTENDANCE_OPTIONS: AttendanceStatus[] = ["PRESENT", "LATE", "ABSENT", "ON_LEAVE", "WORK_FROM_HOME"];

export default async function HrmsPage() {
  const session = await requireSession();
  const [staff, todaysAttendance, leaves] = await Promise.all([
    prisma.staff.findMany({
      where: { active: true, organizationId: session.organizationId },
      orderBy: { name: "asc" },
    }),
    prisma.attendance.findMany({
      where: { date: today(), staff: { organizationId: session.organizationId } },
    }),
    prisma.leave.findMany({
      where: { staff: { organizationId: session.organizationId } },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { staff: true },
    }),
  ]);

  const attendanceByStaff = new Map(todaysAttendance.map((a) => [a.staffId, a]));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-white">HRMS</h1>
        <p className="text-sm text-zinc-500">Staff, attendance and leave management.</p>
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-zinc-300">Today&apos;s attendance</h2>
        </div>
        <DataTable
          columns={[
            { header: "Staff", render: (s) => <div><p className="text-zinc-100">{s.name}</p><p className="text-xs text-zinc-500">{s.designation}</p></div> },
            { header: "Department", render: (s) => s.department },
            {
              header: "Status",
              render: (s) => {
                const status = attendanceByStaff.get(s.id)?.status ?? "ABSENT";
                return <Badge text={status.replaceAll("_", " ")} color={attendanceColor[status]} />;
              },
            },
            {
              header: "Mark as",
              render: (s) => (
                <form
                  action={async (formData) => {
                    "use server";
                    await markAttendance(s.id, formData.get("status") as AttendanceStatus);
                  }}
                  className="flex items-center gap-2"
                >
                  <select
                    name="status"
                    defaultValue={attendanceByStaff.get(s.id)?.status ?? "PRESENT"}
                    className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200"
                  >
                    {ATTENDANCE_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                  <button className="rounded-md bg-sky-500/15 px-2 py-1 text-xs text-sky-300 hover:bg-sky-500/25">
                    Save
                  </button>
                </form>
              ),
            },
          ]}
          rows={staff}
        />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-zinc-300">Leave requests</h2>
        <DataTable
          columns={[
            { header: "Staff", render: (l) => l.staff.name },
            {
              header: "Dates",
              render: (l) =>
                `${l.startDate.toLocaleDateString()} – ${l.endDate.toLocaleDateString()}`,
            },
            { header: "Reason", render: (l) => l.reason },
            {
              header: "Status",
              render: (l) => (
                <Badge
                  text={l.status}
                  color={l.status === "APPROVED" ? "green" : l.status === "REJECTED" ? "red" : "yellow"}
                />
              ),
            },
            {
              header: "Action",
              render: (l) =>
                l.status === "PENDING" ? (
                  <div className="flex gap-2">
                    <form action={async () => { "use server"; await updateLeaveStatus(l.id, "APPROVED"); }}>
                      <button className="rounded-md bg-emerald-500/15 px-2 py-1 text-xs text-emerald-300 hover:bg-emerald-500/25">
                        Approve
                      </button>
                    </form>
                    <form action={async () => { "use server"; await updateLeaveStatus(l.id, "REJECTED"); }}>
                      <button className="rounded-md bg-red-500/15 px-2 py-1 text-xs text-red-300 hover:bg-red-500/25">
                        Reject
                      </button>
                    </form>
                  </div>
                ) : (
                  <span className="text-xs text-zinc-600">—</span>
                ),
            },
          ]}
          rows={leaves}
        />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-zinc-300">Add staff</h2>
        <form action={addStaff} className="grid max-w-2xl grid-cols-2 gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <input name="name" placeholder="Full name" required className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-500" />
          <input name="email" type="email" placeholder="Email" required className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-500" />
          <input name="designation" placeholder="Designation" className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-500" />
          <input name="department" placeholder="Department" className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-500" />
          <button className="col-span-2 rounded-lg bg-sky-500 py-2 text-sm font-medium text-white hover:bg-sky-400">
            Add staff member
          </button>
        </form>
      </section>
    </div>
  );
}
