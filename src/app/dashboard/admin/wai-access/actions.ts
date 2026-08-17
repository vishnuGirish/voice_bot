"use server";

import { getSession } from "@/lib/auth";
import { setToolEnabled } from "@/lib/wai/toolRegistry";
import { logActivity } from "@/lib/activityLog";
import { revalidatePath } from "next/cache";

export async function toggleTool(toolName: string, enabled: boolean) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    throw new Error("Only admins can change WAI data access.");
  }

  await setToolEnabled(toolName, enabled);
  await logActivity({
    category: "SYSTEM",
    action: "WAI_TOOL_ACCESS_CHANGED",
    description: `${enabled ? "Enabled" : "Disabled"} WAI access to "${toolName}"`,
    targetType: "AssistantToolSetting",
    targetId: toolName,
    metadata: { enabled },
  });
  revalidatePath("/dashboard/admin/wai-access");
}
