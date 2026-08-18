import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createApiKey, revokeApiKey } from "./actions";
import Badge from "@/components/Badge";

export default async function ApiKeysPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 text-sm text-zinc-400">
        Only admins can manage embed API keys.
      </div>
    );
  }

  const keys = await prisma.apiKey.findMany({
    where: { organizationId: session.organizationId },
    orderBy: { createdAt: "desc" },
  });
  const hdrs = await headers();
  const proto = hdrs.get("x-forwarded-proto") ?? "http";
  const host = hdrs.get("host") ?? "localhost:3000";
  const origin = `${proto}://${host}`;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-white">WAI Embed Plugin</h1>
        <p className="max-w-2xl text-sm text-zinc-500">
          Issue an API key to embed the WAI assistant (chat + voice) into another website. It still answers from
          this Digitalize instance&apos;s data, governed by the same permissions set in{" "}
          <span className="text-zinc-300">WAI Data Access</span>.
        </p>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-medium text-zinc-300">Issue a new key</h2>
        <form action={createApiKey} className="flex max-w-xl gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <input
            name="label"
            placeholder="Who's this for? e.g. Marketing site"
            required
            className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-500"
          />
          <button className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-400">
            Generate key
          </button>
        </form>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-zinc-300">Active keys</h2>
        <div className="space-y-2">
          {keys.length === 0 && <p className="text-sm text-zinc-500">No keys issued yet.</p>}
          {keys.map((k) => (
            <div key={k.id} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-zinc-100">{k.label}</p>
                  <p className="text-xs text-zinc-500">
                    Created {k.createdAt.toLocaleDateString()}
                    {k.lastUsedAt ? ` · last used ${k.lastUsedAt.toLocaleString()}` : " · never used"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge text={k.revoked ? "Revoked" : "Active"} color={k.revoked ? "red" : "green"} />
                  {!k.revoked && (
                    <form action={async () => { "use server"; await revokeApiKey(k.id); }}>
                      <button className="rounded-md bg-red-500/15 px-2 py-1 text-xs text-red-300 hover:bg-red-500/25">
                        Revoke
                      </button>
                    </form>
                  )}
                </div>
              </div>
              <code className="block truncate rounded-lg bg-zinc-950 px-3 py-2 text-xs text-zinc-400">{k.key}</code>
              {!k.revoked && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-sky-400">Embed snippet</summary>
                  <pre className="mt-2 overflow-x-auto rounded-lg bg-zinc-950 p-3 text-xs text-zinc-400">
{`<iframe
  src="${origin}/embed?key=${k.key}"
  style="border:none;width:400px;height:600px"
  allow="microphone"
></iframe>`}
                  </pre>
                </details>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
