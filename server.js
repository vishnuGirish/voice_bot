require("dotenv").config();

const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { WebSocketServer, WebSocket } = require("ws");
const { PrismaClient } = require("@prisma/client");
const { jwtVerify } = require("jose");
const { Pool } = require("pg");

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT) || 3000;
const app = next({ dev });
const handle = app.getRequestHandler();

const DEEPGRAM_AGENT_URL = "wss://agent.deepgram.com/v1/agent/converse";

const prisma = new PrismaClient();

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

async function resolveSessionOrg(req) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies["digitalize_session"];
  if (!token) return null;
  try {
    const secretKey = new TextEncoder().encode(process.env.AUTH_SECRET || "dev-secret-change-me");
    const { payload } = await jwtVerify(token, secretKey);
    return payload.organizationId || null;
  } catch {
    return null;
  }
}

async function resolveApiKeyOrg(key) {
  if (!key) return null;
  const record = await prisma.apiKey.findUnique({ where: { key } });
  if (!record || record.revoked) return null;
  prisma.apiKey.update({ where: { key }, data: { lastUsedAt: new Date() } }).catch(() => {});
  return record.organizationId;
}

// ---------- External data source (org-connected read-only Postgres) ----------

const externalPoolCache = new Map();

function sslConfigFor(connectionUrl) {
  if (connectionUrl.includes("sslmode=disable")) return undefined;
  try {
    const host = new URL(connectionUrl).hostname;
    if (host === "localhost" || host === "127.0.0.1") return undefined;
  } catch {
    // fall through and default to SSL
  }
  return { rejectUnauthorized: false };
}

function getExternalPool(connectionUrl) {
  let pool = externalPoolCache.get(connectionUrl);
  if (!pool) {
    pool = new Pool({
      connectionString: connectionUrl,
      max: 3,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000,
      ssl: sslConfigFor(connectionUrl),
    });
    pool.on("error", (err) => console.error("External DB pool error:", err.message));
    externalPoolCache.set(connectionUrl, pool);
  }
  return pool;
}

function quoteIdentifier(name) {
  return `"${name.replace(/"/g, '""')}"`;
}

async function queryExternalTable(connectionUrl, tableName, limit, scopeGroups) {
  const pool = getExternalPool(connectionUrl);
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);

  const groups = (scopeGroups || []).filter((g) => g.columns.length > 0);
  if (groups.length > 0) {
    const params = [];
    const clauses = groups.map((group) => {
      const inner = group.columns
        .map((col) => {
          params.push(group.value);
          return `${quoteIdentifier(col)} = $${params.length}`;
        })
        .join(" OR ");
      return `(${inner})`;
    });
    params.push(safeLimit);
    const result = await pool.query(
      `SELECT * FROM ${quoteIdentifier(tableName)} WHERE ${clauses.join(" AND ")} LIMIT $${params.length}`,
      params
    );
    return { rowCount: result.rowCount, rows: result.rows };
  }

  const result = await pool.query(`SELECT * FROM ${quoteIdentifier(tableName)} LIMIT $1`, [safeLimit]);
  return { rowCount: result.rowCount, rows: result.rows };
}

// ---------- Tool schema (Deepgram / OpenAI-style function definition) ----------
// WAI only ever answers from an org's connected external database — there is no built-in
// fallback. query_table is the single function it gets, scoped to that org's allow-listed tables.

async function executeTool(name, input, organizationId, userId, companyId) {
  input = input || {};
  if (name !== "query_table") {
    return { error: `Unknown function: ${name}` };
  }

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { dataSourceUrl: true, enabledTables: true, userScopeColumns: true, companyScopeColumns: true },
  });
  const table = String(input.table || "");
  if (!org || !org.dataSourceUrl || !org.enabledTables.includes(table)) {
    return { error: "That table isn't accessible." };
  }

  const userColumns = (org.userScopeColumns || {})[table] || [];
  const companyColumns = (org.companyScopeColumns || {})[table] || [];

  const missing = [];
  if (userColumns.length > 0 && !userId) missing.push("userId");
  if (companyColumns.length > 0 && !companyId) missing.push("companyId");
  if (missing.length > 0) {
    return { error: `This table requires ${missing.join(" and ")} to be passed with the request.` };
  }

  const scopeGroups = [];
  if (userColumns.length > 0 && userId) scopeGroups.push({ columns: userColumns, value: userId });
  if (companyColumns.length > 0 && companyId) scopeGroups.push({ columns: companyColumns, value: companyId });

  return queryExternalTable(org.dataSourceUrl, table, input.limit, scopeGroups);
}

/** Returns the function list for this org, or { connected: false } if it hasn't connected an
 * external database — callers should give the caller a plain "not connected" message rather
 * than opening a tool-less conversation that might otherwise invent an answer. */
async function getFunctionsForOrg(organizationId) {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { dataSourceUrl: true, enabledTables: true },
  });

  if (!org || !org.dataSourceUrl || org.enabledTables.length === 0) {
    return { connected: false };
  }

  const functions = [
    {
      name: "query_table",
      description:
        "Read rows from this organization's connected external database. Only the tables listed in the enum are accessible — nothing else.",
      parameters: {
        type: "object",
        properties: {
          table: { type: "string", enum: org.enabledTables, description: "Which table to read from" },
          limit: { type: "number", description: "Max rows to return, default 50, max 200" },
        },
        required: ["table"],
      },
    },
  ];
  return { connected: true, functions, externalTables: org.enabledTables };
}

function agentPrompt(externalTables) {
  if (!externalTables) {
    return `#Role
You are WAI, speaking to this organization's staff over a live voice call. This organization has not connected a data source, so you have no functions and no data to answer from.

#General Guidelines
-Be warm, friendly, and professional.
-If asked anything about the business, say plainly that no data source is connected for this organization yet and an admin needs to connect one — never invent an answer.
-Keep responses to 1–2 sentences.
-Do not use markdown formatting.

#Voice-Specific Instructions
-Speak in a conversational tone—your responses will be spoken aloud.
-Never interrupt.`;
  }

  return `#Role
You are WAI, speaking to this organization's staff over a live voice call, answering from their own connected database.
You have one function, query_table, which reads rows from these tables: ${externalTables.join(", ")}. ALWAYS call it to answer questions about the business — never guess or invent numbers. If a question needs a table that isn't in that list, say plainly it isn't accessible.

#General Guidelines
-Be warm, friendly, and professional.
-Speak clearly and naturally in plain language.
-Keep most responses to 1–2 sentences and under 120 characters unless the caller asks for more detail (max: 300 characters).
-Do not use markdown formatting.
-Use varied phrasing; avoid repetition.

#Voice-Specific Instructions
-Speak in a conversational tone—your responses will be spoken aloud.
-Pause after questions to allow for replies.
-Confirm what the caller said if uncertain.
-Never interrupt.`;
}

function buildAgentSettings(functions, externalTables) {
  return {
    type: "Settings",
    audio: {
      input: { encoding: "linear16", sample_rate: 48000 },
      output: { encoding: "linear16", sample_rate: 24000, container: "none" },
    },
    agent: {
      speak: { provider: { type: "deepgram", version: "v2", model: "flux-kit-en" } },
      listen: { provider: { type: "deepgram", version: "v2", model: "flux-general-en" } },
      think: {
        provider: { type: "google", model: "gemini-3.1-flash-lite" },
        functions,
        prompt: agentPrompt(externalTables),
      },
      greeting: "Hello! How may I help you?",
    },
  };
}


app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  const wss = new WebSocketServer({ noServer: true });
  const nextUpgradeHandler = app.getUpgradeHandler();

  server.on("upgrade", async (req, socket, head) => {
    const { pathname, query } = parse(req.url, true);
    if (pathname === "/wai-voice") {
      let organizationId = (await resolveSessionOrg(req)) || (await resolveApiKeyOrg(query.key));
      if (!organizationId && !query.key && typeof query.organizationId === "string") {
        // No API key at all — same keyless mode as POST /api/wai/chat: identifying the
        // organization by ID alone. Only meant for calls you trust, same caveat as there.
        const org = await prisma.organization.findUnique({ where: { id: query.organizationId }, select: { id: true } });
        if (org) organizationId = org.id;
      }
      if (!organizationId) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }
      const userId = typeof query.userId === "string" ? query.userId : undefined;
      const companyId = typeof query.companyId === "string" ? query.companyId : undefined;
      wss.handleUpgrade(req, socket, head, (client) => {
        handleVoiceClient(client, organizationId, userId, companyId).catch((err) => {
          console.error("Voice client setup error:", err);
          client.close();
        });
      });
      return;
    }
    nextUpgradeHandler(req, socket, head);
  });

  async function handleFunctionCallRequest(msg, upstream, organizationId, userId, companyId) {
    const calls = msg.functions || (msg.function_name ? [msg] : []);
    for (const call of calls) {
      const name = call.name || call.function_name;
      const id = call.id || call.function_call_id;
      let args = {};
      try {
        args = typeof call.arguments === "string" ? JSON.parse(call.arguments) : call.arguments || {};
      } catch {
        args = {};
      }
      let result;
      try {
        result = await executeTool(name, args, organizationId, userId, companyId);
      } catch (err) {
        result = { error: String(err && err.message ? err.message : err) };
      }
      const response = {
        type: "FunctionCallResponse",
        id,
        name,
        content: JSON.stringify(result),
      };
      if (upstream.readyState === WebSocket.OPEN) {
        upstream.send(JSON.stringify(response));
      }
    }
  }

  async function handleVoiceClient(client, organizationId, userId, companyId) {
    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) {
      client.send(JSON.stringify({ type: "Error", message: "DEEPGRAM_API_KEY is not configured on the server." }));
      client.close();
      return;
    }

    // Snapshot the org's data-source config for the lifetime of this call.
    const config = await getFunctionsForOrg(organizationId);
    const functions = config.connected ? config.functions : [];
    const externalTables = config.connected ? config.externalTables : null;

    const upstream = new WebSocket(DEEPGRAM_AGENT_URL, {
      headers: { Authorization: `token ${apiKey}` },
    });

    let pending = [];
    upstream.on("open", () => {
      upstream.send(JSON.stringify(buildAgentSettings(functions, externalTables)));
      for (const { data, isBinary } of pending) upstream.send(data, { binary: isBinary });
      pending = [];
    });

    client.on("message", (data, isBinary) => {
      if (upstream.readyState === WebSocket.OPEN) {
        upstream.send(data, { binary: isBinary });
      } else {
        pending.push({ data, isBinary });
      }
    });

    upstream.on("message", (data, isBinary) => {
      if (!isBinary) {
        let msg;
        try {
          msg = JSON.parse(data.toString());
        } catch {
          msg = null;
        }
        if (msg && msg.type === "FunctionCallRequest") {
          handleFunctionCallRequest(msg, upstream, organizationId, userId, companyId).catch((err) =>
            console.error("Function call handling error:", err)
          );
          return; // don't forward raw function-call plumbing to the browser
        }
      }
      if (client.readyState === WebSocket.OPEN) {
        client.send(data, { binary: isBinary });
      }
    });

    upstream.on("error", (err) => {
      console.error("Deepgram agent upstream error:", err.message);
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: "Error", message: "Voice service connection failed." }));
      }
    });

    upstream.on("close", () => {
      if (client.readyState === WebSocket.OPEN) client.close();
    });

    client.on("close", () => {
      if (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING) {
        upstream.close();
      }
    });

    client.on("error", () => {
      upstream.close();
    });
  }

  server.listen(port, () => {
    console.log(`> Ready on http://localhost:${port} (voice proxy at /wai-voice)`);
  });
});
