import { prisma } from "@/lib/db";
import DataTable from "@/components/DataTable";
import Badge from "@/components/Badge";

export default async function StaffPage() {
  const staff = await prisma.staff.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { tasks: true, leaves: true } } },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-white">Staff Directory</h1>
        <p className="text-sm text-zinc-500">Everyone on the team.</p>
      </div>

      <DataTable
        columns={[
          { header: "Name", render: (s) => s.name },
          { header: "Designation", render: (s) => s.designation },
          { header: "Department", render: (s) => s.department },
          { header: "Email", render: (s) => s.email },
          { header: "Tasks assigned", render: (s) => s._count.tasks },
          { header: "Status", render: (s) => <Badge text={s.active ? "Active" : "Inactive"} color={s.active ? "green" : "gray"} /> },
        ]}
        rows={staff}
      />
    </div>
  );
}
