import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getSession } from "@/lib/auth";
import { toolDefinitions, executeTool } from "@/lib/wai/tools";
import { getEnabledToolNames } from "@/lib/wai/toolRegistry";
import { validateApiKey } from "@/lib/wai/apiKeys";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-WAI-Api-Key",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

const SYSTEM_PROMPT = `You are WAI, the friendly AI assistant embedded in the Digitalize ERP dashboard.
You help staff and managers quickly find answers about attendance, leave, sales pipeline, projects, invoices, and the full activity log (audit trail of every action taken in the system) by using the tools available to you — never guess numbers, always call a tool.
Answer concisely, in the same language the user asked in (including Tamil or Malayalam if they write in those languages). Use short lists or a couple of sentences, not long essays. If a query needs no tool (e.g. greetings), just respond directly. If a question asks about something that isn't tracked by any tool (e.g. lunch breaks, custom fields), say plainly that it isn't tracked yet — never invent an answer.`;

function json(body: unknown, init?: { status?: number }) {
  return NextResponse.json(body, { ...init, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  const apiKey = req.headers.get("x-wai-api-key");
  const authorized = session || (await validateApiKey(apiKey));

  if (!authorized) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return json({ error: "ANTHROPIC_API_KEY is not configured on the server." }, { status: 500 });
  }

  const { messages } = (await req.json()) as {
    messages: { role: "user" | "assistant"; content: string }[];
  };

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const enabledTools = await getEnabledToolNames();
  const availableTools = toolDefinitions.filter((t) => enabledTools.has(t.name));

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
        system: SYSTEM_PROMPT,
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
          const result = await executeTool(block.name, block.input as Record<string, unknown>);
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
