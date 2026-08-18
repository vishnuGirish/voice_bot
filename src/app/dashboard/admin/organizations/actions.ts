"use server";

import { prisma } from "@/lib/db";
import { getSession, hashPassword } from "@/lib/auth";
import { logActivity } from "@/lib/activityLog";
import { revalidatePath } from "next/cache";

async function requireAdmin() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    throw new Error("Only admins can manage organizations.");
  }
  return session;
}

export async function createOrganization(formData: FormData) {
  const session = await requireAdmin();

  const orgName = String(formData.get("orgName") || "").trim();
  const adminName = String(formData.get("adminName") || "").trim();
  const adminEmail = String(formData.get("adminEmail") || "").trim().toLowerCase();
  const adminPassword = String(formData.get("adminPassword") || "");
  if (!orgName || !adminName || !adminEmail || adminPassword.length < 6) return;

  const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (existing) return;

  const org = await prisma.organization.create({ data: { name: orgName } });
  await prisma.user.create({
    data: {
      name: adminName,
      email: adminEmail,
      passwordHash: await hashPassword(adminPassword),
      role: "ADMIN",
      organizationId: org.id,
    },
  });

  await logActivity({
    category: "SYSTEM",
    action: "ORGANIZATION_CREATED",
    description: `Created organization "${orgName}" with admin ${adminEmail}`,
    targetType: "Organization",
    targetId: org.id,
    organizationId: session.organizationId,
  });

  revalidatePath("/dashboard/admin/organizations");
}
