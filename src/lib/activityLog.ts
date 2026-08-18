import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import type { LogCategory, Prisma } from "@prisma/client";

export async function logActivity(params: {
  category: LogCategory;
  action: string;
  description: string;
  targetType?: string;
  targetId?: string;
  metadata?: Prisma.InputJsonValue;
  actor?: { userId: string; name: string };
  organizationId?: string;
}) {
  const session = params.actor && params.organizationId ? null : await getSession();
  const actor = params.actor ?? (session ? { userId: session.userId, name: session.name } : null);
  const organizationId = params.organizationId ?? session?.organizationId;

  if (!organizationId) {
    throw new Error("logActivity: organizationId is required (pass it explicitly or call within a session).");
  }

  await prisma.activityLog.create({
    data: {
      organizationId,
      actorUserId: actor?.userId ?? null,
      actorName: actor?.name ?? "System",
      category: params.category,
      action: params.action,
      description: params.description,
      targetType: params.targetType,
      targetId: params.targetId,
      metadata: params.metadata,
    },
  });
}
