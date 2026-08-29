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

function startOfDay(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  d.setHours(0, 0, 0, 0);
  return d;
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

// ---------- Tool schemas (Deepgram / OpenAI-style function definitions) ----------

const FUNCTIONS = [
  {
    name: "get_attendance_summary",
    description:
      "Get today's (or a given date's) attendance summary: who is present, absent, late, on leave or working from home.",
    parameters: {
      type: "object",
      properties: { date: { type: "string", description: "ISO date, defaults to today" } },
    },
  },
  {
    name: "get_staff_on_leave",
    description: "List staff who are on approved leave today or on a given date.",
    parameters: {
      type: "object",
      properties: { date: { type: "string", description: "ISO date, defaults to today" } },
    },
  },
  {
    name: "get_pending_leave_requests",
    description: "List leave requests that are still pending approval.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "get_sales_pipeline_summary",
    description: "Summarize the CRM sales pipeline: number and value of leads per stage.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "get_project_status_summary",
    description: "Summarize active projects and their task progress.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "get_overdue_invoices",
    description: "List invoices that are overdue or unpaid, with client and amount.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "search_staff",
    description: "Search staff directory by name, department or designation.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "Search text" } },
      required: ["query"],
    },
  },
  {
    name: "search_activity_logs",
    description:
      "Search the audit trail of every action taken in the system — logins, attendance changes, leave decisions, leads, tasks, invoices, expenses, new staff/clients.",
    parameters: {
      type: "object",
      properties: {
        actorName: { type: "string", description: "Filter by the person who performed the action" },
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

async function executeTool(name, input, organizationId, userId, companyId) {
  input = input || {};
  switch (name) {
    case "query_table": {
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
    case "get_attendance_summary": {
      const date = startOfDay(input.date);
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
      const date = startOfDay(input.date);
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
        stages: leads.map((l) => ({ stage: l.stage, count: l._count._all, totalValue: Number(l._sum.value ?? 0) })),
      };
    }
    case "get_project_status_summary": {
      const projects = await prisma.project.findMany({ where: { organizationId }, include: { tasks: true, client: true } });
      return {
        projects: projects.map((p) => ({
          name: p.name,
          client: p.client ? p.client.name : null,
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
          dueAt: i.dueAt ? i.dueAt.toISOString().slice(0, 10) : null,
        })),
      };
    }
    case "search_staff": {
      const query = String(input.query || "");
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
        results: staff.map((s) => ({ name: s.name, designation: s.designation, department: s.department, email: s.email })),
      };
    }
    case "search_activity_logs": {
      const limit = Math.min(Number(input.limit) || 20, 100);
      const logs = await prisma.activityLog.findMany({
        where: {
          organizationId,
          actorName: input.actorName ? { contains: String(input.actorName), mode: "insensitive" } : undefined,
          category: input.category || undefined,
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
      return { error: `Unknown function: ${name}` };
  }
}

async function getEnabledToolNames() {
  const rows = await prisma.assistantToolSetting.findMany();
  const disabled = new Set(rows.filter((r) => !r.enabled).map((r) => r.toolName));
  return new Set(FUNCTIONS.map((f) => f.name).filter((name) => !disabled.has(name)));
}

/** Returns the function list + enabled set for this org — swaps in the external `query_table`
 * function instead of the built-in ERP tools when the org has connected its own database. */
async function getFunctionsForOrg(organizationId) {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { dataSourceUrl: true, enabledTables: true },
  });

  if (org && org.dataSourceUrl && org.enabledTables.length > 0) {
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
    return { functions, enabledToolNames: new Set(["query_table"]), externalTables: org.enabledTables };
  }

  const enabledToolNames = await getEnabledToolNames();
  return { functions: FUNCTIONS, enabledToolNames, externalTables: null };
}

function agentPrompt(externalTables) {
  if (externalTables) {
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

  return `#Role
You are WAI, the AI assistant for the Digitalize ERP, speaking to staff and managers over a live voice call.
You have real functions available to look up live attendance, leave, sales pipeline, projects, invoices, staff directory and the full activity log — ALWAYS call the relevant function to answer questions about the business. Never guess or invent numbers.
When calling get_attendance_summary or get_staff_on_leave, do NOT guess or pass a "date" argument unless the caller explicitly names a different day (e.g. "yesterday", "last Monday") — omit the argument entirely to get today's real data, since you do not reliably know the current date yourself.

#General Guidelines
-Be warm, friendly, and professional.
-Speak clearly and naturally in plain language.
-Keep most responses to 1–2 sentences and under 120 characters unless the caller asks for more detail (max: 300 characters).
-Do not use markdown formatting.
-Use varied phrasing; avoid repetition.
-If a question needs data not covered by any function (e.g. lunch breaks, custom fields), say plainly it isn't tracked yet — never invent an answer.

#Voice-Specific Instructions
-Speak in a conversational tone—your responses will be spoken aloud.
-Pause after questions to allow for replies.
-Confirm what the caller said if uncertain.
-Never interrupt.`;
}

function buildAgentSettings(functions, enabledToolNames, externalTables) {
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
        functions: functions.filter((f) => enabledToolNames.has(f.name)),
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

  async function handleFunctionCallRequest(msg, upstream, enabledToolNames, organizationId, userId, companyId) {
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
      if (!enabledToolNames.has(name)) {
        result = { error: "This capability has been disabled by an admin." };
      } else {
        try {
          result = await executeTool(name, args, organizationId, userId, companyId);
        } catch (err) {
          result = { error: String(err && err.message ? err.message : err) };
        }
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

    // Snapshot admin-configured access for the lifetime of this call.
    const { functions, enabledToolNames, externalTables } = await getFunctionsForOrg(organizationId);

    const upstream = new WebSocket(DEEPGRAM_AGENT_URL, {
      headers: { Authorization: `token ${apiKey}` },
    });

    let pending = [];
    upstream.on("open", () => {
      upstream.send(JSON.stringify(buildAgentSettings(functions, enabledToolNames, externalTables)));
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
          handleFunctionCallRequest(msg, upstream, enabledToolNames, organizationId, userId, companyId).catch((err) =>
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
