import { prisma } from "@/lib/db";
import crypto from "crypto";

export function generateApiKey() {
  return `wai_${crypto.randomBytes(24).toString("hex")}`;
}

export async function validateApiKey(key: string | null | undefined) {
  if (!key) return false;
  const record = await prisma.apiKey.findUnique({ where: { key } });
  if (!record || record.revoked) return false;
  // fire-and-forget usage tracking
  prisma.apiKey.update({ where: { key }, data: { lastUsedAt: new Date() } }).catch(() => {});
  return true;
}
