import { prisma } from "@/lib/db";
import crypto from "crypto";

export function generateApiKey() {
  return `wai_${crypto.randomBytes(24).toString("hex")}`;
}

/** Returns the organizationId the key grants access to, or null if invalid/revoked. */
export async function resolveApiKeyOrg(key: string | null | undefined): Promise<string | null> {
  if (!key) return null;
  const record = await prisma.apiKey.findUnique({ where: { key } });
  if (!record || record.revoked) return null;
  // fire-and-forget usage tracking
  prisma.apiKey.update({ where: { key }, data: { lastUsedAt: new Date() } }).catch(() => {});
  return record.organizationId;
}

export async function validateApiKey(key: string | null | undefined) {
  return (await resolveApiKeyOrg(key)) !== null;
}
