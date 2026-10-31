import { toast } from "react-toastify";
import { Badge, Button, Card, EmptyState, Spinner } from "../../../../components/ui";
import { useCreateBackupMutation, useDownloadBackupMutation, useGetBackupsQuery, type BackupRecord } from "../../../../store/api/settings.api";
import styles from "./SettingsPage.module.css";

// Database backups (Super Admin): the nightly automatic copies and manual ones, with
// download. Restoring is done from the server with `npm run restore-backup`, on purpose:
// it replaces every record, so it shouldn't be one click away.

const when = (d: string) =>
  new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
const size = (b: number | null) => (b === null ? "—" : b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / 1048576).toFixed(1)} MB`);

const BackupPanel = () => {
  const { data, isLoading, isError, refetch } = useGetBackupsQuery();
  const [createBackup, { isLoading: creating }] = useCreateBackupMutation();
  const [download, { isLoading: downloading, originalArgs }] = useDownloadBackupMutation();

  const latest = (data ?? []).find((b) => b.publicId && !b.deletedAt);
  const lastFailed = data?.[0]?.error ? data[0] : null;

  const backupNow = async () => {
    try {
      await createBackup().unwrap();
      toast.success("Backup saved");
    } catch (e: any) {
      toast.error(e?.data?.message ?? "Backup failed");
      refetch();
    }
  };

  const get = async (b: BackupRecord) => {
    try {
      await download(b.id).unwrap();
    } catch (e: any) {
      toast.error(e?.data?.message ?? "Couldn't download the backup");
    }
  };

  return (
    <div className={styles.stack}>
      <Card
        title="Database backup"
        subtitle="A full copy of every record (students, fees, marks, staff…) is saved automatically every night after 2 AM and kept for 30 days."
      >
        <div className={styles.backupTop}>
          <div>
            <span className={styles.label}>Last backup</span>
            <div className={styles.backupWhen}>{latest ? when(latest.createdAt) : "None yet"}</div>
            {lastFailed && <div className={styles.backupError}>Last attempt failed: {lastFailed.error}</div>}
          </div>
          <Button onClick={backupNow} isLoading={creating}>
            Back up now
          </Button>
        </div>
        <p className={styles.muted} style={{ margin: "0.75rem 0 0" }}>
          Backups are stored privately in the school's Cloudinary account, separate from the database. Download one now and then and keep it on a
          pen drive or Google Drive as well. A backup can take up to a minute.
        </p>
      </Card>

      <Card title="Saved backups" padded={false}>
        {isLoading ? (
          <Spinner />
        ) : isError ? (
          <EmptyState title="Couldn't load backups" action={<Button onClick={() => refetch()}>Retry</Button>} />
        ) : !data?.length ? (
          <EmptyState title="No backups yet" description="The first automatic backup runs tonight, or press Back up now." />
        ) : (
          <ul className={styles.backupList}>
            {data.map((b) => (
              <li key={b.id}>
                <div>
                  <strong>{when(b.createdAt)}</strong>
                  <small>
                    {b.error
                      ? `Failed: ${b.error}`
                      : `${size(b.sizeBytes)} · ${b.tableCount ?? "—"} tables · ${(b.rowCount ?? 0).toLocaleString("en-IN")} records`}
                  </small>
                </div>
                <Badge tone={b.error ? "danger" : b.kind === "AUTO" ? "neutral" : "primary"}>{b.error ? "Failed" : b.kind === "AUTO" ? "Automatic" : "Manual"}</Badge>
                {b.publicId && !b.deletedAt ? (
                  <Button size="sm" variant="outline" onClick={() => get(b)} isLoading={downloading && originalArgs === b.id}>
                    Download
                  </Button>
                ) : (
                  <span className={styles.muted}>{b.deletedAt ? "Removed (older than 30 days)" : ""}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Restoring a backup">
        <p className={styles.muted} style={{ margin: 0, lineHeight: 1.6 }}>
          Restoring replaces <strong>all</strong> current data with the backup's, so it is done by your developer on the server, not from this page:
          download the backup, then run <code>npm run restore-backup -- backup-file.json.gz</code> in the backend folder. It first does a trial run
          and changes nothing; adding <code>--yes</code> does the real restore.
        </p>
      </Card>
    </div>
  );
};

export default BackupPanel;
