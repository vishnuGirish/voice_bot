import { Pool } from "pg";

const poolCache = new Map<string, Pool>();

function sslConfigFor(connectionUrl: string) {
  if (connectionUrl.includes("sslmode=disable")) return undefined;
  try {
    const host = new URL(connectionUrl).hostname;
    if (host === "localhost" || host === "127.0.0.1") return undefined;
  } catch {
    // fall through and default to SSL
  }
  // Most managed Postgres (Supabase, RDS, Render, etc.) requires SSL even
  // when the pasted connection string doesn't spell out sslmode=require.
  return { rejectUnauthorized: false };
}

function getPool(connectionUrl: string) {
  let pool = poolCache.get(connectionUrl);
  if (!pool) {
    pool = new Pool({
      connectionString: connectionUrl,
      max: 3,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000,
      ssl: sslConfigFor(connectionUrl),
    });
    pool.on("error", (err) => console.error("External DB pool error:", err.message));
    poolCache.set(connectionUrl, pool);
  }
  return pool;
}

function quoteIdentifier(name: string) {
  return `"${name.replace(/"/g, '""')}"`;
}

export type TableInfo = {
  table: string;
  columns: { name: string; type: string }[];
};

/** Lists real base tables + columns in the public schema — used to build the admin's checklist.
 * One joined query instead of one-per-table, so this stays fast even on schemas with hundreds
 * of tables (e.g. a typical Django/Supabase database). */
export async function listExternalTables(connectionUrl: string): Promise<TableInfo[]> {
  const pool = getPool(connectionUrl);
  const result = await pool.query<{ table_name: string; column_name: string; data_type: string }>(
    `SELECT t.table_name, c.column_name, c.data_type
     FROM information_schema.tables t
     JOIN information_schema.columns c
       ON c.table_schema = t.table_schema AND c.table_name = t.table_name
     WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
     ORDER BY t.table_name, c.ordinal_position`
  );

  const byTable = new Map<string, TableInfo>();
  for (const row of result.rows) {
    let entry = byTable.get(row.table_name);
    if (!entry) {
      entry = { table: row.table_name, columns: [] };
      byTable.set(row.table_name, entry);
    }
    entry.columns.push({ name: row.column_name, type: row.data_type });
  }
  return Array.from(byTable.values());
}

/**
 * Read-only fetch from an allow-listed table only. `tableName` MUST already be
 * verified as a member of the organization's saved `enabledTables` list before
 * calling this — never pass user/LLM-controlled table names straight through.
 */
export async function queryExternalTable(connectionUrl: string, tableName: string, limit = 50) {
  const pool = getPool(connectionUrl);
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const result = await pool.query(`SELECT * FROM ${quoteIdentifier(tableName)} LIMIT $1`, [safeLimit]);
  return { rowCount: result.rowCount, rows: result.rows };
}

export async function testExternalConnection(connectionUrl: string) {
  const pool = getPool(connectionUrl);
  await pool.query("SELECT 1");
}
