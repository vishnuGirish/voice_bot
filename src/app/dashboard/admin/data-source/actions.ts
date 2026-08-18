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
    data: { dataSourceUrl: url, enabledTables: [] },
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

  await prisma.organization.update({
    where: { id: session.organizationId },
    data: { enabledTables: tables },
  });
  await logActivity({
    category: "SYSTEM",
    action: "DATA_SOURCE_TABLES_UPDATED",
    description: `WAI can now query: ${tables.join(", ") || "(none)"}`,
    organizationId: session.organizationId,
  });
  revalidatePath("/dashboard/admin/data-source");
}

export async function disconnectDataSource() {
  const session = await requireAdmin();
  await prisma.organization.update({
    where: { id: session.organizationId },
    data: { dataSourceUrl: null, enabledTables: [] },
  });
  await logActivity({
    category: "SYSTEM",
    action: "DATA_SOURCE_DISCONNECTED",
    description: "Disconnected external data source; WAI reverted to built-in ERP data",
    organizationId: session.organizationId,
  });
  revalidatePath("/dashboard/admin/data-source");
}
