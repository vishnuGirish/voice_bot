import { prisma } from "@/lib/db";
import DataTable from "@/components/DataTable";
import { addClient } from "./actions";
import { requireSession } from "@/lib/auth";

export default async function ClientsPage() {
  const session = await requireSession();
  const clients = await prisma.client.findMany({
    where: { organizationId: session.organizationId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { leads: true, projects: true, invoices: true } } },
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-white">Clients</h1>
        <p className="text-sm text-zinc-500">Everyone you do business with.</p>
      </div>

      <DataTable
        columns={[
          { header: "Name", render: (c) => <div><p className="text-zinc-100">{c.name}</p><p className="text-xs text-zinc-500">{c.company}</p></div> },
          { header: "Email", render: (c) => c.email ?? "—" },
          { header: "Phone", render: (c) => c.phone ?? "—" },
          { header: "Leads", render: (c) => c._count.leads },
          { header: "Projects", render: (c) => c._count.projects },
          { header: "Invoices", render: (c) => c._count.invoices },
        ]}
        rows={clients}
      />

      <section>
        <h2 className="mb-3 text-sm font-medium text-zinc-300">Add client</h2>
        <form action={addClient} className="grid max-w-2xl grid-cols-2 gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <input name="name" placeholder="Contact name" required className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-500" />
          <input name="company" placeholder="Company" className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-500" />
          <input name="email" type="email" placeholder="Email" className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-500" />
          <input name="phone" placeholder="Phone" className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-500" />
          <button className="col-span-2 rounded-lg bg-sky-500 py-2 text-sm font-medium text-white hover:bg-sky-400">
            Add client
          </button>
        </form>
      </section>
    </div>
  );
}
