import { Pool } from "pg";

const poolCache = new Map<string, Pool>();

function getPool(connectionUrl: string) {
  let pool = poolCache.get(connectionUrl);
  if (!pool) {
    pool = new Pool({
      connectionString: connectionUrl,
      max: 3,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      ssl: connectionUrl.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined,
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

/** Lists real base tables + columns in the public schema — used to build the admin's checklist. */
export async function listExternalTables(connectionUrl: string): Promise<TableInfo[]> {
  const pool = getPool(connectionUrl);
  const tablesResult = await pool.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`
  );

  const tables: TableInfo[] = [];
  for (const row of tablesResult.rows) {
    const colsResult = await pool.query<{ column_name: string; data_type: string }>(
      `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
      [row.table_name]
    );
    tables.push({
      table: row.table_name,
      columns: colsResult.rows.map((c) => ({ name: c.column_name, type: c.data_type })),
    });
  }
  return tables;
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
