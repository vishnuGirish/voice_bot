import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { TOOL_REGISTRY } from "@/lib/wai/toolRegistry";
import { toggleTool } from "./actions";

export default async function WaiAccessPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 text-sm text-zinc-400">
        Only admins can manage WAI's data access.
      </div>
    );
  }

  const settings = await prisma.assistantToolSetting.findMany();
  const disabled = new Set(settings.filter((s) => !s.enabled).map((s) => s.toolName));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-white">WAI Data Access</h1>
        <p className="text-sm text-zinc-500">
          Control exactly which data WAI (text chat and voice) is allowed to look up. Turning something off applies
          immediately to both — WAI simply won't have that capability anymore, in any language or mode.
        </p>
      </div>

      <div className="space-y-2">
        {TOOL_REGISTRY.map((tool) => {
          const enabled = !disabled.has(tool.name);
          return (
            <div
              key={tool.name}
              className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/60 p-4"
            >
              <div>
                <p className="text-sm font-medium text-zinc-100">{tool.label}</p>
                <p className="text-xs text-zinc-500">{tool.description}</p>
              </div>
              <form
                action={async () => {
                  "use server";
                  await toggleTool(tool.name, !enabled);
                }}
              >
                <button
                  type="submit"
                  className={`relative h-6 w-11 rounded-full transition-colors ${
                    enabled ? "bg-sky-500" : "bg-zinc-700"
                  }`}
                  aria-label={`Toggle ${tool.label}`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                      enabled ? "translate-x-5" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </form>
            </div>
          );
        })}
      </div>
    </div>
  );
}
