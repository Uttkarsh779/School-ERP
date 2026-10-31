import { useState } from "react";
import { toast } from "react-toastify";
import { Badge, Button, Card, EmptyState, Icon, Input, Modal, Spinner } from "../../../../../components/ui";
import { CERTIFICATES, printCertificate } from "../../../../../components/shared/Print/certificates";
import { usePrintSchool } from "../../../../../components/shared/Print/usePrintSchool";
import { useCancelCertificateMutation, useGetStudentCertificatesQuery, type StudentCertificate } from "../../../../../store/api/certificates.api";
import IssueCertificateModal from "./IssueCertificateModal";
import historyStyles from "../history/StudentHistory.module.css";
import styles from "./Certificates.module.css";

const fmt = (d: string) => new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

// Every certificate issued to this student (TC, Bonafide, Character, Fee), with reprint and
// cancel. Cancelled ones stay listed so the register has no gaps.
const CertificatesTab = ({ studentId }: { studentId: number }) => {
  const { data: certificates, isLoading, isError, refetch } = useGetStudentCertificatesQuery(studentId);
  const schoolFor = usePrintSchool();
  const [cancelCertificate, { isLoading: cancelling }] = useCancelCertificateMutation();

  const [issuing, setIssuing] = useState(false);
  const [cancelling_, setCancelling] = useState<StudentCertificate | null>(null);
  const [reason, setReason] = useState("");

  const hasActiveTc = (certificates ?? []).some((c) => c.type === "TRANSFER" && !c.cancelledAt);

  const reprint = (c: StudentCertificate) =>
    printCertificate({ type: c.type, serialNo: c.serialNo, issueDate: c.issueDate.slice(0, 10), data: c.data, cancelled: !!c.cancelledAt }, schoolFor(c.type === "TRANSFER" ? "tc" : "certificate"));

  const confirmCancel = async () => {
    if (!cancelling_) return;
    try {
      await cancelCertificate({ id: cancelling_.id, reason }).unwrap();
      toast.success(
        cancelling_.type === "TRANSFER" && cancelling_.data.markedLeft === "yes"
          ? `${cancelling_.serialNo} cancelled — the student is active again.`
          : `${cancelling_.serialNo} cancelled.`
      );
      setCancelling(null);
      setReason("");
    } catch (err: any) {
      toast.error(err?.data?.message ?? "Couldn't cancel the certificate.");
    }
  };

  return (
    <div className={historyStyles.tab}>
      <Card
        title="Certificates"
        subtitle="Transfer, Bonafide, Character and Fee certificates issued to this student"
        action={
          <Button size="sm" icon={<Icon name="plus" size={15} />} onClick={() => setIssuing(true)}>
            Issue certificate
          </Button>
        }
      >
        {isLoading ? (
          <Spinner />
        ) : isError ? (
          <EmptyState title="Couldn't load certificates" description="Check your connection and try again." action={<Button variant="outline" onClick={() => refetch()}>Retry</Button>} />
        ) : !certificates?.length ? (
          <EmptyState title="No certificates issued yet" description="Issue a TC, Bonafide, Character or Fee certificate — it's filled in from this student's record." />
        ) : (
          <ul className={historyStyles.academicList}>
            {certificates.map((c) => (
              <li key={c.id} className={`${historyStyles.listItem} ${styles.listRow} ${c.cancelledAt ? styles.cancelled : ""}`}>
                <div className={historyStyles.listMain}>
                  <div className={historyStyles.itemTitle}>
                    {CERTIFICATES[c.type]?.label ?? c.type} · {c.serialNo}
                  </div>
                  <div className={historyStyles.muted}>
                    Issued {fmt(c.issueDate)}
                    {c.issuedByUser ? ` by ${c.issuedByUser.name}` : ""}
                    {c.data.purpose ? ` · ${c.data.purpose}` : ""}
                    {c.cancelledAt ? ` · Cancelled: ${c.cancelReason}` : ""}
                  </div>
                </div>
                {c.cancelledAt ? <Badge tone="danger">Cancelled</Badge> : <Badge tone="success">Issued</Badge>}
                <div className={styles.rowActions}>
                  <Button size="sm" variant="outline" icon={<Icon name="printer" size={15} />} onClick={() => reprint(c)}>
                    Print
                  </Button>
                  {!c.cancelledAt && (
                    <Button size="sm" variant="ghost" onClick={() => setCancelling(c)}>
                      Cancel
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {issuing && <IssueCertificateModal studentId={studentId} hasActiveTc={hasActiveTc} onClose={() => setIssuing(false)} />}

      {cancelling_ && (
        <Modal title={`Cancel ${cancelling_.serialNo}?`} size="sm" onClose={() => setCancelling(null)}>
          <p className={styles.note}>
            The certificate stays in the register marked as cancelled; reprints show "CANCELLED".
            {cancelling_.type === "TRANSFER" && cancelling_.data.markedLeft === "yes" && " The student will be made active again."}
          </p>
          <Input label="Reason" required value={reason} placeholder="e.g. Wrong date of birth printed" onChange={(e) => setReason(e.target.value)} />
          <div className={styles.actions}>
            <Button variant="ghost" onClick={() => setCancelling(null)}>
              Keep it
            </Button>
            <Button variant="danger" isLoading={cancelling} disabled={reason.trim().length < 3} onClick={confirmCancel}>
              Cancel certificate
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default CertificatesTab;
