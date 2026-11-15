import { prisma } from "../../config/prisma";
import { cloudinary } from "../../config/cloudinary";
import { httpError } from "../../utils/httpError";
import { createDump } from "./dump";
import { publicMessage } from "../../utils/publicError";

// Database backups: a gzipped JSON copy of every table, uploaded privately ("authenticated":
// no public link works) to Cloudinary, so it survives even if the database is lost. A daily
// automatic backup runs at night; the Super Admin can also back up and download any time.
// Automatic backups older than KEEP_DAYS are deleted from storage.

const FOLDER = "school_erp/backups";
const KEEP_DAYS = 30;
const MAX_BYTES = 10 * 1024 * 1024; // Cloudinary free plan: 10 MB per raw file

const stamp = (d: Date) => {
  const ist = new Date(d.getTime() + 5.5 * 3600_000).toISOString(); // file names in India time
  return `${ist.slice(0, 10)}_${ist.slice(11, 13)}${ist.slice(14, 16)}`;
};

const upload = (buffer: Buffer, publicId: string) =>
  new Promise<{ public_id: string; bytes: number }>((resolve, reject) => {
    cloudinary.uploader
      .upload_stream({ resource_type: "raw", type: "authenticated", folder: FOLDER, public_id: publicId, overwrite: false }, (err, res) =>
        err || !res ? reject(err ?? new Error("Upload failed")) : resolve(res)
      )
      .end(buffer);
  });

export const runBackup = async (kind: "AUTO" | "MANUAL", userId?: number) => {
  try {
    const { buffer, tableCount, rowCount } = await createDump();
    if (buffer.length > MAX_BYTES) throw new Error(`Backup is ${(buffer.length / 1048576).toFixed(1)} MB, over the 10 MB storage limit per file`);
    const res = await upload(buffer, `backup_${stamp(new Date())}_${kind.toLowerCase()}.json.gz`);
    return prisma.backupRecord.create({
      data: { kind, publicId: res.public_id, sizeBytes: res.bytes, tableCount, rowCount, createdByUserId: userId ?? null },
    });
  } catch (e: any) {
    // Logged so the Super Admin sees a failed night on the Backup page.
    await prisma.backupRecord.create({ data: { kind, error: publicMessage(e, "The backup failed. See the server log for details.").slice(0, 500), createdByUserId: userId ?? null } });
    throw e;
  }
};

export const listBackups = () => prisma.backupRecord.findMany({ orderBy: { createdAt: "desc" }, take: 60 });

// The file itself, fetched through a short-lived signed link (never handed to the browser).
export const downloadBackup = async (id: number) => {
  const rec = await prisma.backupRecord.findUnique({ where: { id } });
  if (!rec?.publicId || rec.deletedAt) throw httpError(404, "This backup is no longer stored");
  const url = cloudinary.utils.private_download_url(rec.publicId, "", {
    resource_type: "raw",
    type: "authenticated",
    expires_at: Math.floor(Date.now() / 1000) + 300,
  });
  const res = await fetch(url);
  if (!res.ok) throw httpError(502, "Couldn't fetch the backup from storage");
  return { buffer: Buffer.from(await res.arrayBuffer()), fileName: rec.publicId.split("/").pop() ?? `backup-${id}.json.gz` };
};

// Automatic backups older than KEEP_DAYS are removed from storage (manual ones are kept
// until deleted by hand in Cloudinary).
export const pruneOldBackups = async () => {
  const cutoff = new Date(Date.now() - KEEP_DAYS * 86400_000);
  const old = await prisma.backupRecord.findMany({ where: { kind: "AUTO", deletedAt: null, publicId: { not: null }, createdAt: { lt: cutoff } } });
  for (const rec of old) {
    try {
      await cloudinary.uploader.destroy(rec.publicId!, { resource_type: "raw", type: "authenticated", invalidate: true });
      await prisma.backupRecord.update({ where: { id: rec.id }, data: { deletedAt: new Date() } });
    } catch (e: any) {
      console.warn("[Backup] couldn't delete old backup", rec.publicId, e?.message);
    }
  }
};

// Nightly: from 2 AM India time, once per day (checked every 30 minutes, so a server that
// was asleep at 2 AM still backs up when it wakes).
const istNow = () => new Date(Date.now() + 5.5 * 3600_000);

export const runNightlyBackup = async () => {
  const now = istNow();
  if (now.getUTCHours() < 2) return;
  const todayStartIst = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - 5.5 * 3600_000);
  const done = await prisma.backupRecord.findFirst({ where: { kind: "AUTO", publicId: { not: null }, createdAt: { gte: todayStartIst } } });
  if (done) return;
  // At most one failed attempt per 6 hours, so a broken setup doesn't retry all day.
  const failed = await prisma.backupRecord.findFirst({ where: { kind: "AUTO", error: { not: null }, createdAt: { gte: new Date(Date.now() - 6 * 3600_000) } } });
  if (failed) return;
  await runBackup("AUTO");
  await pruneOldBackups();
};

export const startBackupJob = () => {
  if (!process.env.CLOUDINARY_API_SECRET) {
    console.warn("[Backup] Cloudinary isn't configured; automatic backups are off.");
    return;
  }
  const tick = () => runNightlyBackup().catch((e) => console.error("[Backup] nightly backup failed:", e?.message ?? e));
  setTimeout(tick, 60_000);
  setInterval(tick, 30 * 60_000);
};
