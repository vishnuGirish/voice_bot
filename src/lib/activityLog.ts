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
}) {
  const actor = params.actor ?? (await getSession().then((s) => (s ? { userId: s.userId, name: s.name } : null)));

  await prisma.activityLog.create({
    data: {
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
