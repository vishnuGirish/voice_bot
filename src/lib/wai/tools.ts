import { prisma } from "@/lib/db";
import type Anthropic from "@anthropic-ai/sdk";
import { queryExternalTable } from "./externalDb";

function startOfDay(dateStr?: string) {
  const d = dateStr ? new Date(dateStr) : new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export const toolDefinitions: Anthropic.Tool[] = [
  {
    name: "get_attendance_summary",
    description:
      "Get today's (or a given date's) attendance summary: who is present, absent, late, on leave or working from home.",
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string", description: "ISO date, defaults to today" },
      },
    },
  },
  {
    name: "get_staff_on_leave",
    description: "List staff who are on approved leave today or on a given date.",
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string", description: "ISO date, defaults to today" },
      },
    },
  },
  {
    name: "get_pending_leave_requests",
    description: "List leave requests that are still pending approval.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_sales_pipeline_summary",
    description: "Summarize the CRM sales pipeline: number and value of leads per stage.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_project_status_summary",
    description: "Summarize active projects and their task progress.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_overdue_invoices",
    description: "List invoices that are overdue or unpaid, with client and amount.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "search_staff",
    description: "Search staff directory by name, department or designation.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search text" },
      },
      required: ["query"],
    },
  },
  {
    name: "search_activity_logs",
    description:
      "Search the audit trail of every action taken in the system — logins, attendance changes, leave decisions, leads, tasks, invoices, expenses, new staff/clients. Use this for questions like 'what did X do today', 'who changed this invoice', 'recent activity', 'what happened in HRMS this week'.",
    input_schema: {
      type: "object",
      properties: {
        actorName: { type: "string", description: "Filter by the person who performed the action (partial match)" },
        category: {
          type: "string",
          enum: ["AUTH", "HRMS", "CRM", "PROJECTS", "ACCOUNTING", "SYSTEM"],
          description: "Filter by module category",
        },
        since: { type: "string", description: "ISO date/time — only logs after this time" },
        limit: { type: "number", description: "Max results, default 20, max 100" },
      },
    },
  },
];

/**
 * When an org has connected an external database (see /dashboard/admin/data-source),
 * WAI only gets a single read-only `query_table` tool scoped to that org's allow-listed
 * tables — the built-in ERP tools above assume Digitalize's own schema and don't apply.
 */
export async function getToolDefinitionsForOrg(organizationId: string): Promise<Anthropic.Tool[]> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { dataSourceUrl: true, enabledTables: true },
  });

  if (org?.dataSourceUrl && org.enabledTables.length > 0) {
    return [
      {
        name: "query_table",
        description:
          "Read rows from this organization's connected external database. Only the tables listed in the enum are accessible — nothing else.",
        input_schema: {
          type: "object",
          properties: {
            table: { type: "string", enum: org.enabledTables, description: "Which table to read from" },
            limit: { type: "number", description: "Max rows to return, default 50, max 200" },
          },
          required: ["table"],
        },
      },
    ];
  }

  return toolDefinitions;
}

export async function executeTool(name: string, input: Record<string, unknown>, organizationId: string) {
  switch (name) {
    case "query_table": {
      const org = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { dataSourceUrl: true, enabledTables: true },
      });
      const table = String(input.table ?? "");
      if (!org?.dataSourceUrl || !org.enabledTables.includes(table)) {
        return { error: "That table isn't accessible." };
      }
      return queryExternalTable(org.dataSourceUrl, table, Number(input.limit) || 50);
    }
    case "get_attendance_summary": {
      const date = startOfDay(input.date as string | undefined);
      const [attendance, allStaff] = await Promise.all([
        prisma.attendance.findMany({ where: { date, staff: { organizationId } }, include: { staff: true } }),
        prisma.staff.findMany({ where: { active: true, organizationId } }),
      ]);
      const recorded = new Set(attendance.map((a) => a.staffId));
      const notRecorded = allStaff.filter((s) => !recorded.has(s.id)).map((s) => s.name);

      return {
        date: date.toISOString().slice(0, 10),
        present: attendance.filter((a) => a.status === "PRESENT").map((a) => a.staff.name),
        late: attendance.filter((a) => a.status === "LATE").map((a) => a.staff.name),
        absent: attendance.filter((a) => a.status === "ABSENT").map((a) => a.staff.name),
        onLeave: attendance.filter((a) => a.status === "ON_LEAVE").map((a) => a.staff.name),
        workFromHome: attendance.filter((a) => a.status === "WORK_FROM_HOME").map((a) => a.staff.name),
        notYetRecorded: notRecorded,
      };
    }

    case "get_staff_on_leave": {
      const date = startOfDay(input.date as string | undefined);
      const leaves = await prisma.leave.findMany({
        where: { status: "APPROVED", startDate: { lte: date }, endDate: { gte: date }, staff: { organizationId } },
        include: { staff: true },
      });
      return {
        date: date.toISOString().slice(0, 10),
        staffOnLeave: leaves.map((l) => ({ name: l.staff.name, reason: l.reason })),
      };
    }

    case "get_pending_leave_requests": {
      const leaves = await prisma.leave.findMany({
        where: { status: "PENDING", staff: { organizationId } },
        include: { staff: true },
      });
      return {
        pending: leaves.map((l) => ({
          name: l.staff.name,
          startDate: l.startDate.toISOString().slice(0, 10),
          endDate: l.endDate.toISOString().slice(0, 10),
          reason: l.reason,
        })),
      };
    }

    case "get_sales_pipeline_summary": {
      const leads = await prisma.lead.groupBy({
        by: ["stage"],
        where: { organizationId },
        _count: { _all: true },
        _sum: { value: true },
      });
      return {
        stages: leads.map((l) => ({
          stage: l.stage,
          count: l._count._all,
          totalValue: Number(l._sum.value ?? 0),
        })),
      };
    }

    case "get_project_status_summary": {
      const projects = await prisma.project.findMany({
        where: { organizationId },
        include: { tasks: true, client: true },
      });
      return {
        projects: projects.map((p) => ({
          name: p.name,
          client: p.client?.name ?? null,
          status: p.status,
          totalTasks: p.tasks.length,
          doneTasks: p.tasks.filter((t) => t.status === "DONE").length,
        })),
      };
    }

    case "get_overdue_invoices": {
      const invoices = await prisma.invoice.findMany({
        where: { status: { in: ["OVERDUE", "SENT"] }, organizationId },
        include: { client: true },
      });
      return {
        invoices: invoices.map((i) => ({
          number: i.number,
          client: i.client.name,
          amount: Number(i.amount),
          status: i.status,
          dueAt: i.dueAt?.toISOString().slice(0, 10) ?? null,
        })),
      };
    }

    case "search_staff": {
      const query = String(input.query ?? "");
      const staff = await prisma.staff.findMany({
        where: {
          organizationId,
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { department: { contains: query, mode: "insensitive" } },
            { designation: { contains: query, mode: "insensitive" } },
          ],
        },
      });
      return {
        results: staff.map((s) => ({
          name: s.name,
          designation: s.designation,
          department: s.department,
          email: s.email,
        })),
      };
    }

    case "search_activity_logs": {
      const limit = Math.min(Number(input.limit) || 20, 100);
      const logs = await prisma.activityLog.findMany({
        where: {
          organizationId,
          actorName: input.actorName ? { contains: String(input.actorName), mode: "insensitive" } : undefined,
          category: input.category ? (input.category as never) : undefined,
          createdAt: input.since ? { gte: new Date(String(input.since)) } : undefined,
        },
        orderBy: { createdAt: "desc" },
        take: limit,
      });
      return {
        logs: logs.map((l) => ({
          when: l.createdAt.toISOString(),
          who: l.actorName,
          category: l.category,
          action: l.action,
          description: l.description,
        })),
      };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}
