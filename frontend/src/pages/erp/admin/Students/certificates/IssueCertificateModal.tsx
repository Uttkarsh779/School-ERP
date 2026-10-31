import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { Button, Icon, Input, Modal, Select, Spinner } from "../../../../../components/ui";
import { CERTIFICATES, printCertificate } from "../../../../../components/shared/Print/certificates";
import { usePrintSchool } from "../../../../../components/shared/Print/usePrintSchool";
import { useGetCertificatePrefillQuery, useIssueCertificateMutation, type CertificateType } from "../../../../../store/api/certificates.api";
import styles from "./Certificates.module.css";

const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

// Pick a certificate, review the fields filled from the student's record (all editable),
// then issue it — it gets a serial number and the print dialog opens.
const IssueCertificateModal = ({
  studentId,
  hasActiveTc,
  onClose,
}: {
  studentId: number;
  hasActiveTc: boolean;
  onClose: () => void;
}) => {
  const [type, setType] = useState<CertificateType | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [issueDate, setIssueDate] = useState(today());
  const [markLeft, setMarkLeft] = useState(true);

  const schoolFor = usePrintSchool();
  const { data: prefill, isFetching, isError } = useGetCertificatePrefillQuery({ studentId, type: type! }, { skip: !type });
  const [issue, { isLoading: issuing }] = useIssueCertificateMutation();

  useEffect(() => {
    if (prefill) setValues(prefill);
  }, [prefill]);

  const set = (key: string, value: string) => setValues((v) => ({ ...v, [key]: value }));

  const preview = () => type && printCertificate({ type, serialNo: null, issueDate, data: values }, schoolFor(type === "TRANSFER" ? "tc" : "certificate"));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!type) return;
    try {
      const cert = await issue({ studentId, type, issueDate, data: values, markLeft: type === "TRANSFER" ? markLeft : undefined }).unwrap();
      toast.success(`${CERTIFICATES[type].label} issued — ${cert.serialNo}`);
      printCertificate({ type, serialNo: cert.serialNo, issueDate, data: cert.data }, schoolFor(type === "TRANSFER" ? "tc" : "certificate"));
      onClose();
    } catch (err: any) {
      toast.error(err?.data?.message ?? "Couldn't issue the certificate.");
    }
  };

  if (!type) {
    return (
      <Modal title="Issue a certificate" size="lg" onClose={onClose}>
        <div className={styles.typeGrid}>
          {(Object.keys(CERTIFICATES) as CertificateType[]).map((t) => {
            const blocked = t === "TRANSFER" && hasActiveTc;
            return (
              <button
                key={t}
                type="button"
                className={styles.typeCard}
                disabled={blocked}
                style={blocked ? { opacity: 0.55, cursor: "not-allowed" } : undefined}
                onClick={() => setType(t)}
              >
                <strong>{CERTIFICATES[t].label}</strong>
                <span>{blocked ? "Already issued — cancel the existing TC to issue a new one." : CERTIFICATES[t].description}</span>
              </button>
            );
          })}
        </div>
      </Modal>
    );
  }

  const meta = CERTIFICATES[type];
  return (
    <Modal title={meta.label} size="xl" onClose={onClose}>
      {isFetching ? (
        <Spinner />
      ) : isError ? (
        <p className={styles.note}>Couldn't load the student's details. Close and try again.</p>
      ) : (
        <form onSubmit={submit}>
          <p className={styles.note}>Filled in from the student's record. Check and correct anything before issuing — the certificate is saved exactly as issued.</p>
          <div className={styles.fields}>
            {meta.fields.map((f) =>
              f.options ? (
                <div key={f.key} className={f.wide ? styles.wide : undefined}>
                  <Select label={f.label} options={f.options} value={values[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} />
                </div>
              ) : (
                <div key={f.key} className={f.wide ? styles.wide : undefined}>
                  <Input label={f.label} value={values[f.key] ?? ""} maxLength={1000} required={f.key === "studentName"} onChange={(e) => set(f.key, e.target.value)} />
                </div>
              )
            )}
            <div>
              <Input label="Date of issue" type="date" required value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
            </div>
          </div>

          {type === "TRANSFER" && (
            <label className={styles.check}>
              <input type="checkbox" checked={markLeft} onChange={(e) => setMarkLeft(e.target.checked)} />
              <span>
                <strong>Mark the student as left school.</strong> They become inactive and this session is recorded as "Left school". Cancelling the TC later
                undoes this.
              </span>
            </label>
          )}

          <div className={styles.actions}>
            <Button type="button" variant="ghost" onClick={() => setType(null)}>
              Back
            </Button>
            <Button type="button" variant="outline" icon={<Icon name="printer" size={16} />} onClick={preview}>
              Preview
            </Button>
            <Button type="submit" isLoading={issuing}>
              Issue &amp; print
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
};

export default IssueCertificateModal;
