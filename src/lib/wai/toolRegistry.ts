import { prisma } from "@/lib/db";

export const TOOL_REGISTRY = [
  {
    name: "get_attendance_summary",
    label: "Attendance",
    description: "Who's present, absent, late, on leave or WFH today.",
  },
  {
    name: "get_staff_on_leave",
    label: "Leave calendar",
    description: "Who is on approved leave on a given day.",
  },
  {
    name: "get_pending_leave_requests",
    label: "Pending leave requests",
    description: "Leave requests awaiting approval.",
  },
  {
    name: "get_sales_pipeline_summary",
    label: "Sales pipeline",
    description: "CRM leads and deal values by stage.",
  },
  {
    name: "get_project_status_summary",
    label: "Projects",
    description: "Project status and task progress.",
  },
  {
    name: "get_overdue_invoices",
    label: "Invoices",
    description: "Overdue and unpaid invoices.",
  },
  {
    name: "search_staff",
    label: "Staff directory",
    description: "Search staff by name, department or role.",
  },
  {
    name: "search_activity_logs",
    label: "Activity logs",
    description: "The full audit trail of actions taken in the system.",
  },
] as const;

export type ToolName = (typeof TOOL_REGISTRY)[number]["name"];

/** Tools default to enabled unless an admin has explicitly turned them off. */
export async function getEnabledToolNames(): Promise<Set<string>> {
  const rows = await prisma.assistantToolSetting.findMany();
  const disabled = new Set(rows.filter((r) => !r.enabled).map((r) => r.toolName));
  return new Set(TOOL_REGISTRY.map((t) => t.name).filter((name) => !disabled.has(name)));
}

export async function setToolEnabled(toolName: string, enabled: boolean) {
  await prisma.assistantToolSetting.upsert({
    where: { toolName },
    update: { enabled },
    create: { toolName, enabled },
  });
}
