import { prisma } from "@/lib/db";
import WaiEmbedWidget from "@/components/wai/WaiEmbedWidget";

export default async function EmbedPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string; organizationId?: string; userId?: string }>;
}) {
  const { key, organizationId, userId } = await searchParams;

  if (key) {
    const record = await prisma.apiKey.findUnique({ where: { key } });
    if (!record || record.revoked) {
      return (
        <div className="flex h-screen w-screen items-center justify-center bg-zinc-950 p-6 text-center text-sm text-zinc-500">
          This WAI embed link is missing or invalid. Generate a key from the Digitalize admin panel.
        </div>
      );
    }
    return <WaiEmbedWidget apiKey={key} userId={userId} />;
  }

  if (organizationId) {
    const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true } });
    if (!org) {
      return (
        <div className="flex h-screen w-screen items-center justify-center bg-zinc-950 p-6 text-center text-sm text-zinc-500">
          Unknown organizationId.
        </div>
      );
    }
    return <WaiEmbedWidget organizationId={org.id} userId={userId} />;
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-zinc-950 p-6 text-center text-sm text-zinc-500">
      This WAI embed link is missing a key or organizationId.
    </div>
  );
}
