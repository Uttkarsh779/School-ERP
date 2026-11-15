import { prisma } from "../../config/prisma";

// Tests run against the shared database, so each one makes its own throwaway rows and removes
// them at the end, never touching real classes, students or the current session.
//
// `removeTestRows` deletes the rows a test created plus every row that points at them (charges,
// invoices, audit logs, enrollments, notifications ...), found from the database's own foreign
// keys, so it keeps working as the schema grows. It only ever starts from ids the test created.
// The walk runs inside Postgres in one transaction: one round trip, and all-or-nothing.

const DELETE_TREE_FN = `
CREATE OR REPLACE FUNCTION pg_temp.zz_delete_tree(tbl text, ids int[]) RETURNS void AS $fn$
DECLARE
  ref record;
  child_ids int[];
BEGIN
  IF ids IS NULL OR cardinality(ids) = 0 THEN RETURN; END IF;
  FOR ref IN
    SELECT c.relname AS child, a.attname AS col,
           EXISTS (SELECT 1 FROM pg_attribute x WHERE x.attrelid = c.oid AND x.attname = 'id' AND NOT x.attisdropped) AS has_id
    FROM pg_constraint k
    JOIN pg_class c ON c.oid = k.conrelid
    JOIN pg_class p ON p.oid = k.confrelid
    JOIN pg_namespace n ON n.oid = p.relnamespace
    JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = k.conkey[1]
    WHERE k.contype = 'f' AND n.nspname = 'public' AND p.relname = tbl
  LOOP
    IF ref.has_id THEN
      EXECUTE format('SELECT array_agg(id) FROM public.%I WHERE %I = ANY($1) AND NOT (%L = %L AND id = ANY($1))', ref.child, ref.col, ref.child, tbl)
        INTO child_ids USING ids;
      PERFORM pg_temp.zz_delete_tree(ref.child, child_ids);
    ELSE
      EXECUTE format('DELETE FROM public.%I WHERE %I = ANY($1)', ref.child, ref.col) USING ids;
    END IF;
  END LOOP;
  EXECUTE format('DELETE FROM public.%I WHERE id = ANY($1)', tbl) USING ids;
END
$fn$ LANGUAGE plpgsql`;

// Table names as in the database: the Prisma model name unless @@map says otherwise (Staff -> "teachers").
export type CreatedRows = Partial<Record<string, number[]>>;

export const removeTestRows = async (created: CreatedRows) => {
  // Students before their class, classes before the session, users last.
  const order = ["Notice", "TimetableSlot", "Student", "teachers", "ClassSection", "AcademicSession", "TransportVillage", "FeeHead", "User"];
  const tables = [...order.filter((t) => created[t]), ...Object.keys(created).filter((t) => !order.includes(t))];
  const work = tables
    .map((t) => [t, (created[t] ?? []).filter((id) => Number.isInteger(id))] as const)
    .filter(([, ids]) => ids.length);
  if (!work.length) return;
  await prisma.$transaction(async (tx: any) => {
    await tx.$executeRawUnsafe(DELETE_TREE_FN);
    for (const [t, ids] of work) await tx.$executeRawUnsafe(`SELECT pg_temp.zz_delete_tree($1, $2::int[])`, t, ids);
  }, { timeout: 60_000 });
};

// Tracks what a test creates; `remove()` in a finally block cleans it all up.
export const trackTestRows = () => {
  const created: Record<string, number[]> = {};
  return {
    add<T extends { id: number }>(table: string, row: T): T {
      (created[table] ??= []).push(row.id);
      return row;
    },
    remove: () => removeTestRows(created),
  };
};

export const uniqueTag = (prefix = "ZZTEST") => `${prefix}${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 1000)}`;
