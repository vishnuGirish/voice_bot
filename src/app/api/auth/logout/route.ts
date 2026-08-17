import { NextResponse } from "next/server";
import { destroySession, getSession } from "@/lib/auth";
import { logActivity } from "@/lib/activityLog";

export async function POST() {
  const session = await getSession();
  if (session) {
    await logActivity({
      category: "AUTH",
      action: "LOGOUT",
      description: `${session.name} logged out`,
      actor: { userId: session.userId, name: session.name },
    });
  }
  await destroySession();
  return NextResponse.json({ ok: true });
}
