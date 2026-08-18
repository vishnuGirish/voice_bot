"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/activityLog";
import { requireSession } from "@/lib/auth";

export async function addClient(formData: FormData) {
  const session = await requireSession();
  const name = String(formData.get("name") || "").trim();
  const company = String(formData.get("company") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  if (!name) return;

  const client = await prisma.client.create({
    data: { name, company, email, phone, organizationId: session.organizationId },
  });
  await logActivity({
    category: "CRM",
    action: "CLIENT_ADDED",
    description: `Added client ${name}${company ? ` (${company})` : ""}`,
    targetType: "Client",
    targetId: client.id,
    organizationId: session.organizationId,
  });
  revalidatePath("/dashboard/clients");
}
