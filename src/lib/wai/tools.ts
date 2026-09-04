import { prisma } from "@/lib/db";
import type Anthropic from "@anthropic-ai/sdk";
import { queryExternalTable, type ScopeGroup } from "./externalDb";

export type OrgToolConfig =
  | { connected: true; tools: Anthropic.Tool[]; externalTables: string[] }
  | { connected: false };

/**
 * WAI only ever answers from an organization's connected external database — there is no
 * built-in fallback. `query_table` is the single tool it gets, scoped to that org's
 * allow-listed tables (see /dashboard/admin/data-source).
 */
export async function getToolDefinitionsForOrg(organizationId: string): Promise<OrgToolConfig> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { dataSourceUrl: true, enabledTables: true },
  });

  if (!org?.dataSourceUrl || org.enabledTables.length === 0) {
    return { connected: false };
  }

  return {
    connected: true,
    externalTables: org.enabledTables,
    tools: [
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
    ],
  };
}

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  organizationId: string,
  userId?: string,
  companyId?: string
) {
  if (name !== "query_table") {
    return { error: `Unknown tool: ${name}` };
  }

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { dataSourceUrl: true, enabledTables: true, userScopeColumns: true, companyScopeColumns: true },
  });
  const table = String(input.table ?? "");
  if (!org?.dataSourceUrl || !org.enabledTables.includes(table)) {
    return { error: "That table isn't accessible." };
  }

  const userColumns = ((org.userScopeColumns as Record<string, string[]>) ?? {})[table] ?? [];
  const companyColumns = ((org.companyScopeColumns as Record<string, string[]>) ?? {})[table] ?? [];

  const missing: string[] = [];
  if (userColumns.length > 0 && !userId) missing.push("userId");
  if (companyColumns.length > 0 && !companyId) missing.push("companyId");
  if (missing.length > 0) {
    return { error: `This table requires ${missing.join(" and ")} to be passed with the request.` };
  }

  const scopeGroups: ScopeGroup[] = [];
  if (userColumns.length > 0 && userId) scopeGroups.push({ columns: userColumns, value: userId });
  if (companyColumns.length > 0 && companyId) scopeGroups.push({ columns: companyColumns, value: companyId });

  return queryExternalTable(org.dataSourceUrl, table, Number(input.limit) || 50, scopeGroups);
}
