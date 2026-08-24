import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getSession } from "@/lib/auth";
import { getToolDefinitionsForOrg, executeTool } from "@/lib/wai/tools";
import { getEnabledToolNames } from "@/lib/wai/toolRegistry";
import { resolveApiKeyAccess } from "@/lib/wai/apiKeys";
import { prisma } from "@/lib/db";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-WAI-Api-Key",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

const ERP_SYSTEM_PROMPT = `You are WAI, the friendly AI assistant embedded in the Digitalize ERP dashboard.
You help staff and managers quickly find answers about attendance, leave, sales pipeline, projects, invoices, and the full activity log (audit trail of every action taken in the system) by using the tools available to you — never guess numbers, always call a tool.
Answer concisely, in the same language the user asked in (including Tamil or Malayalam if they write in those languages). Use short lists or a couple of sentences, not long essays. If a query needs no tool (e.g. greetings), just respond directly. If a question asks about something that isn't tracked by any tool (e.g. lunch breaks, custom fields), say plainly that it isn't tracked yet — never invent an answer.`;

function externalSystemPrompt(enabledTables: string[]) {
  return `You are WAI, the assistant for this organization, answering questions from their own connected database.
You have one tool, query_table, which reads rows from these tables: ${enabledTables.join(", ")}. Always call it to answer questions about the business — never guess numbers.
Answer concisely, in the same language the user asked in. If a question needs a table that isn't in that list, say plainly that it isn't accessible — never invent an answer.`;
}

function json(body: unknown, init?: { status?: number }) {
  return NextResponse.json(body, { ...init, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  const apiKey = req.headers.get("x-wai-api-key");

  const { messages, userId, organizationId: requestedOrgId } = (await req.json()) as {
    messages: { role: "user" | "assistant"; content: string }[];
    userId?: string;
    organizationId?: string;
  };

  let organizationId: string | null = session?.organizationId ?? null;

  if (!organizationId && !apiKey && requestedOrgId) {
    // No API key at all — the caller (a trusted backend) is identifying the organization by ID
    // alone. There is no secret gate here beyond knowing a real organizationId; only wire this
    // path up to systems you trust, since anyone who can guess/enumerate an org's ID can use it.
    const org = await prisma.organization.findUnique({ where: { id: requestedOrgId }, select: { id: true } });
    if (!org) {
      return json({ error: "Unknown organizationId." }, { status: 400 });
    }
    organizationId = org.id;
  }

  if (!organizationId) {
    const access = session ? null : await resolveApiKeyAccess(apiKey);
    if (!access) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }
    if (access.isPlatformKey) {
      if (!requestedOrgId) {
        return json({ error: "organizationId is required when calling with this API key." }, { status: 400 });
      }
      const org = await prisma.organization.findUnique({ where: { id: requestedOrgId }, select: { id: true } });
      if (!org) {
        return json({ error: "Unknown organizationId." }, { status: 400 });
      }
      organizationId = org.id;
    } else {
      organizationId = access.organizationId;
    }
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return json({ error: "ANTHROPIC_API_KEY is not configured on the server." }, { status: 500 });
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const { tools: allToolDefs, externalTables } = await getToolDefinitionsForOrg(organizationId);
  const enabledTools = externalTables ? new Set(["query_table"]) : await getEnabledToolNames();
  const availableTools = allToolDefs.filter((t) => enabledTools.has(t.name));
  const systemPrompt = externalTables ? externalSystemPrompt(externalTables) : ERP_SYSTEM_PROMPT;

  const conversation: Anthropic.MessageParam[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  let finalText = "";

  try {
    for (let turn = 0; turn < 5; turn++) {
      const response = await client.messages.create({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 1024,
        system: systemPrompt,
        tools: availableTools,
        messages: conversation,
      });

      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
      );

      const textBlocks = response.content.filter(
        (b): b is Anthropic.TextBlock => b.type === "text"
      );
      finalText = textBlocks.map((b) => b.text).join("\n");

      if (response.stop_reason !== "tool_use" || toolUseBlocks.length === 0) {
        break;
      }

      conversation.push({ role: "assistant", content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
        toolUseBlocks.map(async (block) => {
          if (!enabledTools.has(block.name)) {
            return {
              type: "tool_result" as const,
              tool_use_id: block.id,
              content: JSON.stringify({ error: "This capability has been disabled by an admin." }),
            };
          }
          const result = await executeTool(block.name, block.input as Record<string, unknown>, organizationId, userId);
          return {
            type: "tool_result" as const,
            tool_use_id: block.id,
            content: JSON.stringify(result),
          };
        })
      );

      conversation.push({ role: "user", content: toolResults });
    }
  } catch (err) {
    console.error("WAI chat error:", err);
    let message = "WAI ran into a problem answering that. Please try again.";
    if (err instanceof Anthropic.APIError) {
      const body = err.error as { error?: { message?: string } } | undefined;
      message = body?.error?.message ?? err.message;
    }
    return json({ error: message }, { status: 502 });
  }

  return json({ reply: finalText || "Sorry, I couldn't find an answer to that." });
}
