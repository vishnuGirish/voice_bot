import { prisma } from "@/lib/db";
import crypto from "crypto";

export function generateApiKey() {
  return `wai_${crypto.randomBytes(24).toString("hex")}`;
}

export type ApiKeyAccess = { organizationId: string; isPlatformKey: boolean };

/** Looks up the key without resolving which organization it grants access to yet — callers
 * decide that themselves, since a platform key needs a caller-supplied organizationId. */
export async function resolveApiKeyAccess(key: string | null | undefined): Promise<ApiKeyAccess | null> {
  if (!key) return null;
  const record = await prisma.apiKey.findUnique({ where: { key } });
  if (!record || record.revoked) return null;
  // fire-and-forget usage tracking
  prisma.apiKey.update({ where: { key }, data: { lastUsedAt: new Date() } }).catch(() => {});
  return { organizationId: record.organizationId, isPlatformKey: record.isPlatformKey };
}

/** Returns the organizationId the key grants access to, or null if invalid/revoked. Platform
 * keys aren't supported here — use resolveApiKeyAccess directly where a caller-supplied
 * organizationId can be validated (see /api/wai/chat). */
export async function resolveApiKeyOrg(key: string | null | undefined): Promise<string | null> {
  const access = await resolveApiKeyAccess(key);
  if (!access || access.isPlatformKey) return null;
  return access.organizationId;
}

export async function validateApiKey(key: string | null | undefined) {
  return (await resolveApiKeyOrg(key)) !== null;
}
