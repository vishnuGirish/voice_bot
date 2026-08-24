"use server";

import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { logActivity } from "@/lib/activityLog";
import { testExternalConnection } from "@/lib/wai/externalDb";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

async function requireAdmin() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    throw new Error("Only admins can manage the data source.");
  }
  return session;
}

export async function connectDataSource(formData: FormData) {
  const session = await requireAdmin();
  const url = String(formData.get("dataSourceUrl") || "").trim();
  if (!url) return;

  try {
    await testExternalConnection(url);
  } catch (err) {
    console.error("External data source connection failed:", err instanceof Error ? err.message : err);
    const reason = err instanceof Error ? encodeURIComponent(err.message) : "";
    redirect(`/dashboard/admin/data-source?error=connect&reason=${reason}`);
  }

  await prisma.organization.update({
    where: { id: session.organizationId },
    data: { dataSourceUrl: url, enabledTables: [], userScopeColumns: {} },
  });
  await logActivity({
    category: "SYSTEM",
    action: "DATA_SOURCE_CONNECTED",
    description: "Connected an external database as WAI's data source",
    organizationId: session.organizationId,
  });
  revalidatePath("/dashboard/admin/data-source");
  redirect("/dashboard/admin/data-source?connected=1");
}

export async function updateEnabledTables(formData: FormData) {
  const session = await requireAdmin();
  const tables = formData.getAll("tables").map(String);
  const tableSet = new Set(tables);

  // Checkboxes are named "scope:<table>:<column>" — collect the ones that were checked into
  // { table: [column, ...] }, dropping any for a table that ended up unchecked above.
  const userScopeColumns: Record<string, string[]> = {};
  for (const key of formData.keys()) {
    if (!key.startsWith("scope:")) continue;
    const [, table, column] = key.split(":");
    if (!table || !column || !tableSet.has(table)) continue;
    (userScopeColumns[table] ??= []).push(column);
  }

  await prisma.organization.update({
    where: { id: session.organizationId },
    data: { enabledTables: tables, userScopeColumns },
  });
  const scopedCount = Object.keys(userScopeColumns).length;
  await logActivity({
    category: "SYSTEM",
    action: "DATA_SOURCE_TABLES_UPDATED",
    description: `WAI can now query: ${tables.join(", ") || "(none)"}${
      scopedCount ? `; user-scoped: ${Object.entries(userScopeColumns).map(([t, c]) => `${t} (${c.join("/")})`).join(", ")}` : ""
    }`,
    organizationId: session.organizationId,
  });
  revalidatePath("/dashboard/admin/data-source");
  redirect(`/dashboard/admin/data-source?tablesSaved=${tables.length}`);
}

export async function disconnectDataSource() {
  const session = await requireAdmin();
  await prisma.organization.update({
    where: { id: session.organizationId },
    data: { dataSourceUrl: null, enabledTables: [], userScopeColumns: {} },
  });
  await logActivity({
    category: "SYSTEM",
    action: "DATA_SOURCE_DISCONNECTED",
    description: "Disconnected external data source; WAI reverted to built-in ERP data",
    organizationId: session.organizationId,
  });
  revalidatePath("/dashboard/admin/data-source");
}
