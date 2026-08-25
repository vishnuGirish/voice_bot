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
  /** Columns in this table that are foreign keys pointing at a table whose name contains
   * "user" (e.g. accounts_user) — candidates for per-user scoping in the admin UI. */
  userColumns: string[];
  /** Same idea, for foreign keys pointing at a table whose name contains "compan" (company/companies). */
  companyColumns: string[];
};

async function fkColumnsPointingAt(
  pool: ReturnType<typeof getPool>,
  namePattern: string
): Promise<Map<string, string[]>> {
  const result = await pool.query<{ table_name: string; column_name: string }>(
    `SELECT tc.table_name, kcu.column_name
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
     JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
     WHERE tc.table_schema = 'public' AND tc.constraint_type = 'FOREIGN KEY' AND ccu.table_name ILIKE $1`,
    [namePattern]
  );
  const byTable = new Map<string, string[]>();
  for (const row of result.rows) {
    const list = byTable.get(row.table_name) ?? [];
    list.push(row.column_name);
    byTable.set(row.table_name, list);
  }
  return byTable;
}

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

  const [userColumnsByTable, companyColumnsByTable] = await Promise.all([
    fkColumnsPointingAt(pool, "%user%"),
    fkColumnsPointingAt(pool, "%compan%"),
  ]);

  const byTable = new Map<string, TableInfo>();
  for (const row of result.rows) {
    let entry = byTable.get(row.table_name);
    if (!entry) {
      entry = {
        table: row.table_name,
        columns: [],
        userColumns: userColumnsByTable.get(row.table_name) ?? [],
        companyColumns: companyColumnsByTable.get(row.table_name) ?? [],
      };
      byTable.set(row.table_name, entry);
    }
    entry.columns.push({ name: row.column_name, type: row.data_type });
  }
  return Array.from(byTable.values());
}

export type ScopeGroup = { columns: string[]; value: string };

/**
 * Read-only fetch from an allow-listed table only. `tableName` MUST already be
 * verified as a member of the organization's saved `enabledTables` list before
 * calling this — never pass user/LLM-controlled table names straight through.
 *
 * `scopeGroups`, when given, MUST already be verified as columns the admin configured for
 * this exact table (never LLM-controlled) — one group per scoping dimension (e.g. user,
 * company). Within a group, columns are OR'd (a row can belong to a user via either an
 * "assigned to" or "created by" column, for example); across groups, it's AND'd (a row must
 * match the user AND the company, if both are configured).
 */
export async function queryExternalTable(
  connectionUrl: string,
  tableName: string,
  limit = 50,
  scopeGroups?: ScopeGroup[]
) {
  const pool = getPool(connectionUrl);
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);

  const groups = (scopeGroups ?? []).filter((g) => g.columns.length > 0);
  if (groups.length > 0) {
    const params: (string | number)[] = [];
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

export async function testExternalConnection(connectionUrl: string) {
  const pool = getPool(connectionUrl);
  await pool.query("SELECT 1");
}
