import { prisma } from "@/lib/db";
import WaiEmbedWidget from "@/components/wai/WaiEmbedWidget";

export default async function EmbedPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>;
}) {
  const { key } = await searchParams;

  const record = key ? await prisma.apiKey.findUnique({ where: { key } }) : null;
  const valid = record && !record.revoked;

  if (!valid) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-zinc-950 p-6 text-center text-sm text-zinc-500">
        This WAI embed link is missing or invalid. Generate a key from the Digitalize admin panel.
      </div>
    );
  }

  return <WaiEmbedWidget apiKey={key!} />;
}
