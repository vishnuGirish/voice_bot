import { prisma } from "@/lib/db";
import { addLead, updateLeadStage } from "./actions";
import type { LeadStage } from "@prisma/client";
import AutoSubmitSelect from "@/components/AutoSubmitSelect";
import { requireSession } from "@/lib/auth";

const STAGES: LeadStage[] = ["NEW", "CONTACTED", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "WON", "LOST"];

export default async function CrmPage() {
  const session = await requireSession();
  const [leads, clients] = await Promise.all([
    prisma.lead.findMany({
      where: { organizationId: session.organizationId },
      orderBy: { updatedAt: "desc" },
      include: { client: true },
    }),
    prisma.client.findMany({ where: { organizationId: session.organizationId }, orderBy: { name: "asc" } }),
  ]);

  const byStage = new Map<LeadStage, typeof leads>();
  for (const stage of STAGES) byStage.set(stage, []);
  for (const lead of leads) byStage.get(lead.stage)?.push(lead);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-white">CRM / Sales Pipeline</h1>
        <p className="text-sm text-zinc-500">Leads, deals and clients.</p>
      </div>

      <section className="overflow-x-auto">
        <div className="flex min-w-max gap-3 pb-2">
          {STAGES.map((stage) => (
            <div key={stage} className="w-56 shrink-0 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                  {stage.replaceAll("_", " ")}
                </p>
                <span className="text-[11px] text-zinc-600">{byStage.get(stage)?.length ?? 0}</span>
              </div>
              <div className="space-y-2">
                {byStage.get(stage)?.map((lead) => (
                  <div key={lead.id} className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-2">
                    <p className="text-sm text-zinc-100">{lead.title}</p>
                    <p className="text-xs text-zinc-500">{lead.client?.name ?? "No client"}</p>
                    <p className="text-xs text-emerald-400">₹{Number(lead.value).toLocaleString("en-IN")}</p>
                    <form
                      action={async (formData) => {
                        "use server";
                        await updateLeadStage(lead.id, formData.get("stage") as LeadStage);
                      }}
                      className="mt-2"
                    >
                      <AutoSubmitSelect
                        name="stage"
                        defaultValue={lead.stage}
                        className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200"
                        options={STAGES.map((s) => ({ value: s, label: s.replaceAll("_", " ") }))}
                      />
                    </form>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-zinc-300">Add lead</h2>
        <form action={addLead} className="grid max-w-2xl grid-cols-2 gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <input name="title" placeholder="Deal title" required className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-500" />
          <input name="value" type="number" placeholder="Value (₹)" className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-500" />
          <select name="clientId" className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-500">
            <option value="">No client</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input name="ownerName" placeholder="Owner" className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-500" />
          <button className="col-span-2 rounded-lg bg-sky-500 py-2 text-sm font-medium text-white hover:bg-sky-400">
            Add lead
          </button>
        </form>
      </section>
    </div>
  );
}
