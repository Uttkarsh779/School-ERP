// Restores a database backup downloaded from Settings → Backup. Run from the backend folder:
//
//   npm run restore-backup -- path/to/backup_2026-10-31_0200_auto.json.gz            (dry run)
//   npm run restore-backup -- path/to/backup_2026-10-31_0200_auto.json.gz --yes      (restore)
//
// A dry run does the complete restore inside a transaction, checks every table's row count
// and then undoes it, so you can see it will work. With --yes, ALL current data is replaced
// by the backup's. Run the prisma/*.sql files first on a fresh database.
import "dotenv/config";
import { readFileSync } from "fs";
import { readDump, restoreDump } from "../src/modules/backup/dump";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const confirmed = args.includes("--yes");

(async () => {
  if (!file) {
    console.log("Usage: npm run restore-backup -- <backup.json.gz> [--yes]");
    process.exit(1);
  }
  const dump = readDump(readFileSync(file));
  const rows = Object.values(dump.tables).reduce((n, t) => n + t.rows.length, 0);
  console.log(`Backup taken ${dump.createdAt}: ${Object.keys(dump.tables).length} tables, ${rows} rows.`);
  if (confirmed) console.log("Replacing ALL data in the database with this backup...");
  await restoreDump(dump, { dryRun: !confirmed, log: console.log });
  if (!confirmed) console.log("To actually restore, run the same command again with --yes at the end.");
})().catch((e) => {
  console.error("Restore failed, nothing was changed:", e.message);
  process.exit(1);
});
