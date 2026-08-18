import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { listExternalTables } from "@/lib/wai/externalDb";
import { connectDataSource, updateEnabledTables, disconnectDataSource } from "./actions";

function maskUrl(url: string) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.username || "user"}:••••@${u.host}${u.pathname}`;
  } catch {
    return "••••••••";
  }
}

export default async function DataSourcePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; connected?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 text-sm text-zinc-400">
        Only admins can manage the data source.
      </div>
    );
  }

  const { error, connected } = await searchParams;
  const org = await prisma.organization.findUnique({ where: { id: session.organizationId } });
  const connectedUrl = org?.dataSourceUrl ?? null;

  let tables: Awaited<ReturnType<typeof listExternalTables>> = [];
  let introspectError: string | null = null;
  if (connectedUrl) {
    try {
      tables = await listExternalTables(connectedUrl);
    } catch (e) {
      introspectError = e instanceof Error ? e.message : "Could not read tables from this database.";
    }
  }

  const enabledSet = new Set(org?.enabledTables ?? []);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-white">WAI Data Source</h1>
        <p className="max-w-2xl text-sm text-zinc-500">
          By default WAI answers from this organization&apos;s own Digitalize data (HRMS, CRM, Projects,
          Accounting). Connect a different Postgres database here to have WAI answer from that instead — read-only,
          and only from tables you explicitly allow below.
        </p>
      </div>

      {error === "connect" && (
        <div className="rounded-xl border border-red-900 bg-red-950/40 p-4 text-sm text-red-300">
          Couldn&apos;t connect to that database. Check the connection string and that it&apos;s reachable from this
          server, then try again.
        </div>
      )}
      {connected === "1" && (
        <div className="rounded-xl border border-emerald-900 bg-emerald-950/40 p-4 text-sm text-emerald-300">
          Connected. Now pick which tables WAI is allowed to query below.
        </div>
      )}

      {connectedUrl ? (
        <section className="space-y-4">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
            <p className="text-sm text-zinc-300">
              Connected to <code className="text-zinc-400">{maskUrl(connectedUrl)}</code>
            </p>
            <form action={disconnectDataSource} className="mt-3">
              <button className="rounded-md bg-red-500/15 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/25">
                Disconnect (revert to Digitalize&apos;s own data)
              </button>
            </form>
          </div>

          {introspectError ? (
            <div className="rounded-xl border border-red-900 bg-red-950/40 p-4 text-sm text-red-300">
              {introspectError}
            </div>
          ) : (
            <form action={updateEnabledTables} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
              <p className="mb-3 text-sm font-medium text-zinc-300">
                Tables WAI may read ({tables.length} found)
              </p>
              <div className="max-h-96 space-y-2 overflow-y-auto">
                {tables.length === 0 && <p className="text-sm text-zinc-500">No tables found in the public schema.</p>}
                {tables.map((t) => (
                  <label key={t.table} className="flex items-start gap-2 rounded-lg border border-zinc-800 bg-zinc-950/40 p-2">
                    <input
                      type="checkbox"
                      name="tables"
                      value={t.table}
                      defaultChecked={enabledSet.has(t.table)}
                      className="mt-1"
                    />
                    <div>
                      <p className="text-sm text-zinc-200">{t.table}</p>
                      <p className="text-xs text-zinc-500">
                        {t.columns.map((c) => c.name).join(", ")}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
              <button className="mt-3 rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-400">
                Save allowed tables
              </button>
            </form>
          )}
        </section>
      ) : (
        <form action={connectDataSource} className="max-w-xl space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <label className="block text-sm font-medium text-zinc-300">Postgres connection string</label>
          <input
            name="dataSourceUrl"
            placeholder="postgresql://user:password@host:5432/dbname"
            required
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-500"
          />
          <button className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-400">
            Connect
          </button>
        </form>
      )}
    </div>
  );
}
