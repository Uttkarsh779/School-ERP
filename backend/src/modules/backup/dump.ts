import { gunzipSync, gzipSync } from "zlib";
import { Client } from "pg";

// Whole-database dump and restore as gzipped JSON, using plain SQL so it works on any
// Postgres host (no pg_dump needed). Every table in the public schema is included.

export const BACKUP_FORMAT = "rrs-erp-backup";

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: 1;
  createdAt: string;
  tables: Record<string, { columns: string[]; rows: unknown[][] }>;
}

// Every value is kept exactly as Postgres prints it (text), and given back as text on
// restore. Parsing would change things: timestamps would be read in the server's time zone
// and come back shifted by hours.
const asText = { getTypeParser: () => (value: string) => value } as any;

const connect = async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL, types: asText });
  await client.connect();
  return client;
};

const q = (name: string) => `"${name.replace(/"/g, '""')}"`;

const listTables = async (client: Client) =>
  (
    await client.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`
    )
  ).rows.map((r) => r.table_name);

// Parents before children, so rows can be inserted without breaking foreign keys.
const insertOrder = async (client: Client, tables: string[]) => {
  const fks = (
    await client.query<{ child: string; parent: string }>(`
      SELECT DISTINCT tc.table_name AS child, ccu.table_name AS parent
      FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'`)
  ).rows;
  const parents = new Map(tables.map((t) => [t, new Set<string>()]));
  for (const { child, parent } of fks) if (child !== parent && parents.has(child) && parents.has(parent)) parents.get(child)!.add(parent);
  const order: string[] = [];
  const placed = new Set<string>();
  while (order.length < tables.length) {
    const next = tables.filter((t) => !placed.has(t) && [...parents.get(t)!].every((p) => placed.has(p)));
    if (next.length === 0) throw new Error("Circular foreign keys; can't work out a restore order");
    for (const t of next) {
      placed.add(t);
      order.push(t);
    }
  }
  return order;
};

export const createDump = async (): Promise<{ buffer: Buffer; tableCount: number; rowCount: number }> => {
  const client = await connect();
  try {
    // One consistent snapshot of all tables.
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const file: BackupFile = { format: BACKUP_FORMAT, version: 1, createdAt: new Date().toISOString(), tables: {} };
    let rowCount = 0;
    for (const table of await listTables(client)) {
      const res = await client.query({ text: `SELECT * FROM ${q(table)}`, rowMode: "array" });
      file.tables[table] = { columns: res.fields.map((f) => f.name), rows: res.rows };
      rowCount += res.rows.length;
    }
    await client.query("COMMIT");
    return { buffer: gzipSync(JSON.stringify(file)), tableCount: Object.keys(file.tables).length, rowCount };
  } finally {
    await client.end();
  }
};

export const readDump = (buffer: Buffer): BackupFile => {
  const file = JSON.parse(gunzipSync(buffer).toString("utf8"));
  if (file?.format !== BACKUP_FORMAT || file?.version !== 1) throw new Error("This isn't an RRS ERP backup file");
  return file;
};

// Replaces ALL data with the backup's, in one transaction: if anything fails nothing
// changes. dryRun does the whole restore, checks row counts, then rolls back.
export const restoreDump = async (
  file: BackupFile,
  opts: { dryRun: boolean; log?: (msg: string) => void; beforeFinish?: (client: Client) => Promise<void> }
) => {
  const log = opts.log ?? (() => {});
  const client = await connect();
  try {
    const current = await listTables(client);
    const missing = Object.keys(file.tables).filter((t) => !current.includes(t));
    if (missing.length) throw new Error(`Tables in the backup that don't exist in this database: ${missing.join(", ")}. Run the prisma/*.sql files first.`);
    const order = (await insertOrder(client, current)).filter((t) => file.tables[t]);
    const colInfo = await client.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`
    );
    const dbColumns = new Set(colInfo.rows.map((r) => `${r.table_name}.${r.column_name}`));

    await client.query("BEGIN");
    await client.query(`TRUNCATE ${current.map(q).join(", ")} RESTART IDENTITY CASCADE`);
    let total = 0;
    for (const table of order) {
      const { columns, rows } = file.tables[table];
      // Columns added to the database after the backup was taken get their defaults.
      const keep = columns.map((c, i) => [c, i] as const).filter(([c]) => dbColumns.has(`${table}.${c}`));
      const colSql = keep.map(([c]) => q(c)).join(", ");
      // Batches stay under Postgres's limit of 65535 parameters per statement.
      const batchSize = Math.max(1, Math.floor(30000 / Math.max(keep.length, 1)));
      for (let s = 0; s < rows.length; s += batchSize) {
        const params: unknown[] = [];
        const tuples = rows.slice(s, s + batchSize).map(
          (row) =>
            `(${keep
              .map(([, i]) => {
                params.push(row[i]);
                return `$${params.length}`;
              })
              .join(", ")})`
        );
        await client.query(`INSERT INTO ${q(table)} (${colSql}) VALUES ${tuples.join(", ")}`, params);
      }
      const count = Number((await client.query(`SELECT count(*) FROM ${q(table)}`)).rows[0].count);
      if (count !== rows.length) throw new Error(`${table}: expected ${rows.length} rows, got ${count}`);
      total += count;
    }
    // Auto-number counters continue after the restored ids.
    const serials = await client.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND column_default LIKE 'nextval%'`
    );
    for (const { table_name, column_name } of serials.rows) {
      await client.query(
        `SELECT setval(pg_get_serial_sequence($1, $2), COALESCE((SELECT MAX(${q(column_name)}) FROM ${q(table_name)}), 0) + 1, false)`,
        [`public.${q(table_name)}`, column_name]
      );
    }
    // Used by the backup test to compare the restored data before it is undone.
    if (opts.beforeFinish) await opts.beforeFinish(client);
    if (opts.dryRun) {
      await client.query("ROLLBACK");
      log(`Dry run OK: ${order.length} tables, ${total} rows would be restored. Nothing was changed.`);
    } else {
      await client.query("COMMIT");
      log(`Restored ${order.length} tables, ${total} rows.`);
    }
    return { tables: order.length, rows: total };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    await client.end();
  }
};
