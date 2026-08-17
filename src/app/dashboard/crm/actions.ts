"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { LeadStage } from "@prisma/client";
import { logActivity } from "@/lib/activityLog";

export async function addLead(formData: FormData) {
  const title = String(formData.get("title") || "").trim();
  const clientId = String(formData.get("clientId") || "") || null;
  const value = Number(formData.get("value") || 0);
  const ownerName = String(formData.get("ownerName") || "").trim();
  if (!title) return;

  const lead = await prisma.lead.create({
    data: { title, clientId, value, ownerName },
  });
  await logActivity({
    category: "CRM",
    action: "LEAD_ADDED",
    description: `Added lead "${title}" worth ₹${value.toLocaleString("en-IN")}`,
    targetType: "Lead",
    targetId: lead.id,
  });
  revalidatePath("/dashboard/crm");
}

export async function updateLeadStage(leadId: string, stage: LeadStage) {
  const lead = await prisma.lead.update({ where: { id: leadId }, data: { stage } });
  await logActivity({
    category: "CRM",
    action: "LEAD_STAGE_CHANGED",
    description: `Moved lead "${lead.title}" to ${stage.replaceAll("_", " ")}`,
    targetType: "Lead",
    targetId: leadId,
    metadata: { stage },
  });
  revalidatePath("/dashboard/crm");
}
