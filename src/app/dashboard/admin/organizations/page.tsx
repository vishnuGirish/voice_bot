import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createOrganization } from "./actions";

export default async function OrganizationsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 text-sm text-zinc-400">
        Only admins can manage organizations.
      </div>
    );
  }

  const orgs = await prisma.organization.findMany({
    orderBy: { createdAt: "desc" },
    include: { users: { select: { email: true, role: true } }, _count: { select: { staff: true, apiKeys: true } } },
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-white">Organizations</h1>
        <p className="max-w-2xl text-sm text-zinc-500">
          Each organization has its own completely isolated data — staff, leads, invoices, activity logs. WAI (text
          and voice) only ever answers from the data of whichever organization is logged in, or whose API key was
          used. Create a new one below to test with a second, separate "place".
        </p>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-medium text-zinc-300">Create a new organization</h2>
        <form
          action={createOrganization}
          className="grid max-w-xl grid-cols-2 gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4"
        >
          <input
            name="orgName"
            placeholder="Organization name, e.g. Blue Ridge Landscaping"
            required
            className="col-span-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-500"
          />
          <input
            name="adminName"
            placeholder="Admin's full name"
            required
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-500"
          />
          <input
            name="adminEmail"
            type="email"
            placeholder="Admin's email"
            required
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-500"
          />
          <input
            name="adminPassword"
            type="password"
            placeholder="Admin's password (6+ chars)"
            required
            minLength={6}
            className="col-span-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-500"
          />
          <button className="col-span-2 rounded-lg bg-sky-500 py-2 text-sm font-medium text-white hover:bg-sky-400">
            Create organization
          </button>
        </form>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-zinc-300">Existing organizations</h2>
        <div className="space-y-2">
          {orgs.map((org) => (
            <div key={org.id} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-zinc-100">
                  {org.name} {org.id === session.organizationId && <span className="text-xs text-sky-400">(you)</span>}
                </p>
                <p className="text-xs text-zinc-500">
                  {org._count.staff} staff · {org._count.apiKeys} embed key{org._count.apiKeys === 1 ? "" : "s"}
                </p>
              </div>
              <p className="mt-1 text-xs text-zinc-500">
                Logins: {org.users.map((u) => u.email).join(", ") || "none"}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
