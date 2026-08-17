"use server";

import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { generateApiKey } from "@/lib/wai/apiKeys";
import { logActivity } from "@/lib/activityLog";
import { revalidatePath } from "next/cache";

async function requireAdmin() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    throw new Error("Only admins can manage API keys.");
  }
  return session;
}

export async function createApiKey(formData: FormData) {
  await requireAdmin();
  const label = String(formData.get("label") || "").trim();
  if (!label) return;

  const key = generateApiKey();
  await prisma.apiKey.create({ data: { key, label } });
  await logActivity({
    category: "SYSTEM",
    action: "API_KEY_CREATED",
    description: `Created embed API key "${label}"`,
    targetType: "ApiKey",
  });
  revalidatePath("/dashboard/admin/api-keys");
}

export async function revokeApiKey(id: string) {
  await requireAdmin();
  const key = await prisma.apiKey.update({ where: { id }, data: { revoked: true } });
  await logActivity({
    category: "SYSTEM",
    action: "API_KEY_REVOKED",
    description: `Revoked embed API key "${key.label}"`,
    targetType: "ApiKey",
    targetId: id,
  });
  revalidatePath("/dashboard/admin/api-keys");
}
