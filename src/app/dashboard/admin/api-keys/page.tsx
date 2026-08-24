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
  const canIssuePlatformKeys = session.organizationId === "org_digitalize_default";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-white">WAI Embed Plugin</h1>
        <p className="max-w-2xl text-sm text-zinc-500">
          Issue an API key to embed the WAI chat assistant into another website. It still answers from
          this Digitalize instance&apos;s data, governed by the same permissions set in{" "}
          <span className="text-zinc-300">WAI Data Access</span>.
        </p>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-medium text-zinc-300">Issue a new key</h2>
        <form action={createApiKey} className="max-w-xl space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <div className="flex gap-3">
            <input
              name="label"
              placeholder="Who's this for? e.g. Marketing site"
              required
              className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-500"
            />
            <button className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-400">
              Generate key
            </button>
          </div>
          {canIssuePlatformKeys && (
            <label className="flex items-start gap-2 text-xs text-zinc-400">
              <input type="checkbox" name="isPlatformKey" className="mt-0.5" />
              <span>
                <span className="text-zinc-300">Platform-wide key</span> — instead of being locked to this
                organization, every request must pass an <code className="rounded bg-zinc-950 px-1 py-0.5">organizationId</code>{" "}
                choosing which organization&apos;s data to use. Only give this to your own trusted backend — never
                embed it in a public page.
              </span>
            </label>
          )}
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
                  <p className="text-sm font-medium text-zinc-100">
                    {k.label} {k.isPlatformKey && <span className="text-xs text-sky-400">(platform-wide)</span>}
                  </p>
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
              {!k.revoked && k.isPlatformKey && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-sky-400">API usage</summary>
                  <p className="mt-2 text-xs text-zinc-500">
                    Server-to-server only — never embed this key in a public page. Every call must include which
                    organization it's acting on behalf of:
                  </p>
                  <pre className="mt-2 overflow-x-auto rounded-lg bg-zinc-950 p-3 text-xs text-zinc-400">
{`curl -X POST ${origin}/api/wai/chat \\
  -H "Content-Type: application/json" \\
  -H "X-WAI-Api-Key: ${k.key}" \\
  -d '{
    "messages": [{ "role": "user", "content": "..." }],
    "organizationId": "<the org this request is for>"
  }'`}
                  </pre>
                </details>
              )}
              {!k.revoked && !k.isPlatformKey && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-sky-400">Embed snippet</summary>
                  <p className="mt-2 text-xs text-zinc-500">
                    Paste this once, anywhere on the page (e.g. before <code>&lt;/body&gt;</code>). It draws its
                    own floating chat bubble — no fixed iframe box to size or place.
                  </p>
                  <pre className="mt-2 overflow-x-auto rounded-lg bg-zinc-950 p-3 text-xs text-zinc-400">
{`<script src="${origin}/wai-widget.js" data-key="${k.key}" async></script>`}
                  </pre>
                  <p className="mt-3 text-xs text-zinc-500">
                    To open it from your own button instead of waiting for a click on the bubble:
                  </p>
                  <pre className="mt-2 overflow-x-auto rounded-lg bg-zinc-950 p-3 text-xs text-zinc-400">
{`<button onclick="WAI.open()">Chat with us</button>
<!-- also available: WAI.close(), WAI.toggle() -->`}
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
