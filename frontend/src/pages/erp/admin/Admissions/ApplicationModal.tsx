import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { Badge, Button, EmptyState, Icon, Input, Modal, Select, Spinner } from "../../../../components/ui";
import { printRegistrationReceipt } from "../../../../components/shared/Print/registrationReceipt";
import {
  STAGE_LABEL,
  useAdmitApplicationMutation,
  useChangeApplicationStageMutation,
  useGetAdmitPrefillQuery,
  useGetApplicationQuery,
  useOpenApplicationFileMutation,
  useRecordRegistrationFeeMutation,
  useUpdateApplicationMutation,
  useWaiveRegistrationFeeMutation,
  type Application,
  type Stage,
} from "../../../../store/api/admissions.api";
import { useGetPublicWebsiteDataQuery } from "../../../../store/api/cms.api";
import { useCan } from "../../../../store/permissions";
import { getErrorMessage, inr } from "../Fees/feeUtils";
import ApplicationForm from "./ApplicationForm";
import styles from "./Admissions.module.css";

export const STAGE_TONE: Record<Stage, "neutral" | "info" | "warning" | "primary" | "success" | "danger"> = {
  ENQUIRY: "neutral",
  APPLIED: "info",
  TEST: "warning",
  SELECTED: "primary",
  ADMITTED: "success",
  REJECTED: "danger",
  WITHDRAWN: "neutral",
};
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) : "—");
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : "—");
const dash = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));
const GENDER: Record<string, string> = { MALE: "Boy", FEMALE: "Girl", OTHER: "Other" };
const ACTION_TEXT: Record<string, string> = {
  ENQUIRY: "Enquiry from the website",
  APPLIED_ONLINE: "Applied online",
  ENTERED_BY_OFFICE: "Application entered by the office",
  CONTACTED: "Family contacted",
  APPLICATION_STARTED: "Enquiry turned into an application",
  TEST_SCHEDULED: "Test / interview scheduled",
  RESCHEDULED: "Test / interview rescheduled",
  TEST_RESULT: "Test result recorded",
  SELECTED: "Selected",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
  REOPENED: "Reopened",
  FEE_PAID: "Registration fee received",
  FEE_PAID_ONLINE: "Registration fee paid online",
  FEE_WAIVED: "Registration fee waived",
  ADMITTED: "Admitted",
  EDITED: "Edited",
  FILE_DELETED: "File deleted",
};
const localDateTime = (d = new Date(Date.now() + 86400_000)) => {
  const x = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return `${x.toISOString().slice(0, 10)}T10:00`;
};

type Dialog = "edit" | "apply" | "schedule" | "result" | "reject" | "withdraw" | "fee" | "waive" | "admit" | null;

const ApplicationModal = ({ id, onClose }: { id: number; onClose: () => void }) => {
  const can = useCan();
  const navigate = useNavigate();
  const canManage = can("admissions.manage");
  const { data: a, isLoading, isError } = useGetApplicationQuery(id);
  const { data: site } = useGetPublicWebsiteDataQuery();
  const [stage, { isLoading: moving }] = useChangeApplicationStageMutation();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [viewing, setViewing] = useState<Application["files"][number] | null>(null);

  const quick = async (action: string, done: string) => {
    try {
      await stage({ id, action }).unwrap();
      toast.success(done);
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't save"));
    }
  };

  const receipt = () =>
    a?.feeReceiptNo &&
    printRegistrationReceipt(
      {
        receiptNo: a.feeReceiptNo,
        paidAt: a.feePaidAt ?? a.createdAt,
        amount: a.feeAmount,
        mode: a.feeMode,
        reference: a.feeReference,
        applicationNo: a.applicationNo,
        studentName: a.studentName,
        className: a.className,
        sessionName: a.session?.name ?? null,
        receivedFrom: a.contactName,
      },
      site?.settings
    );

  return (
    <Modal title={a ? `${a.studentName} · ${a.applicationNo}` : "Application"} size="xl" onClose={onClose}>
      {isLoading ? (
        <Spinner />
      ) : isError || !a ? (
        <EmptyState title="Couldn't load the application" />
      ) : (
        <div>
          <div className={styles.actionBar}>
            <Badge tone={STAGE_TONE[a.stage]}>{STAGE_LABEL[a.stage]}</Badge>
            {canManage && a.stage === "ENQUIRY" && (
              <>
                {!a.contactedAt && (
                  <Button size="sm" variant="outline" isLoading={moving} onClick={() => quick("CONTACTED", "Marked as contacted")}>
                    Mark contacted
                  </Button>
                )}
                <Button size="sm" onClick={() => setDialog("apply")}>
                  Make it an application
                </Button>
              </>
            )}
            {canManage && (a.stage === "APPLIED" || a.stage === "TEST") && (
              <>
                <Button size="sm" variant={a.stage === "APPLIED" ? "primary" : "outline"} onClick={() => setDialog("schedule")}>
                  {a.stage === "TEST" ? "Reschedule test" : "Schedule test / interview"}
                </Button>
                {a.stage === "TEST" && (
                  <Button size="sm" onClick={() => setDialog("result")}>
                    Record result
                  </Button>
                )}
                <Button size="sm" variant="outline" isLoading={moving} onClick={() => quick("SELECT", "Selected")}>
                  Select{a.stage === "APPLIED" ? " (no test)" : ""}
                </Button>
              </>
            )}
            {a.stage === "SELECTED" && can("students.edit") && (
              <Button size="sm" icon={<Icon name="graduationCap" size={15} />} onClick={() => setDialog("admit")}>
                Admit
              </Button>
            )}
            {canManage && ["ENQUIRY", "APPLIED", "TEST", "SELECTED"].includes(a.stage) && (
              <>
                <Button size="sm" variant="ghost" onClick={() => setDialog("reject")}>
                  Reject
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDialog("withdraw")}>
                  Withdrawn
                </Button>
              </>
            )}
            {canManage && (a.stage === "REJECTED" || a.stage === "WITHDRAWN") && (
              <Button size="sm" variant="outline" isLoading={moving} onClick={() => quick("REOPEN", "Reopened")}>
                Reopen
              </Button>
            )}
            {a.admittedStudent && (
              <Button size="sm" variant="outline" onClick={() => navigate(`/admin/students/${a.admittedStudent!.id}`)}>
                Open student {a.admittedStudent.admissionNo}
              </Button>
            )}
          </div>
          {a.closedReason && <p className={styles.danger}>Reason: {a.closedReason}</p>}

          <section className={styles.block}>
            <div className={styles.blockHead}>
              <h4>Details</h4>
              {canManage && a.stage !== "ADMITTED" && (
                <Button size="sm" variant="ghost" icon={<Icon name="edit" size={14} />} onClick={() => setDialog("edit")}>
                  Edit
                </Button>
              )}
            </div>
            <dl className={styles.detailGrid}>
              {(
                [
                  ["Class", `${a.className}${a.session ? ` · ${a.session.name}` : ""}`],
                  ["Date of birth", a.dob ? day(a.dob) : null],
                  ["Gender", a.gender ? GENDER[a.gender] : null],
                  ["Blood group", a.bloodGroup],
                  ["Category", a.category],
                  ["Aadhaar", a.aadharNumber],
                  ["Previous school", [a.previousSchool, a.previousClass].filter(Boolean).join(" · ")],
                  ["Father", [a.fatherName, a.fatherPhone, a.fatherOccupation].filter(Boolean).join(" · ")],
                  ["Mother", [a.motherName, a.motherPhone, a.motherOccupation].filter(Boolean).join(" · ")],
                  ["Contact", `${a.contactName} · ${a.phone}`],
                  ["Email", a.email],
                  ["Address", a.address],
                  ["Message", a.message],
                  ["Received", `${when(a.createdAt)} · ${a.source === "ONLINE_FORM" ? "online form" : a.source === "OFFICE" ? "office" : "website enquiry"}`],
                ] as Array<[string, string | null]>
              ).map(([k, val]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{dash(val)}</dd>
                </div>
              ))}
            </dl>
            <p className={styles.muted} style={{ marginTop: "0.6rem" }}>
              <a href={`tel:${a.phone}`}>
                <Icon name="phone" size={13} /> Call {a.phone}
              </a>
            </p>
          </section>

          {(a.testAt || a.testResult) && (
            <section className={styles.block}>
              <div className={styles.blockHead}>
                <h4>Test / interview</h4>
              </div>
              <dl className={styles.detailGrid}>
                <div>
                  <dt>When</dt>
                  <dd>
                    {when(a.testAt)}
                    {a.testVenue ? ` · ${a.testVenue}` : ""}
                  </dd>
                </div>
                <div>
                  <dt>Result</dt>
                  <dd>{a.testResult ? `${a.testResult[0]}${a.testResult.slice(1).toLowerCase()}${a.testRemarks ? ` · ${a.testRemarks}` : ""}` : "Not recorded"}</dd>
                </div>
              </dl>
            </section>
          )}

          <section className={styles.block}>
            <div className={styles.blockHead}>
              <h4>Registration fee</h4>
              <div className={styles.rowActions}>
                {a.feeStatus === "UNPAID" && can("admissions.fee") && (
                  <Button size="sm" onClick={() => setDialog("fee")}>
                    Record payment
                  </Button>
                )}
                {a.feeStatus === "UNPAID" && can("fees.waive") && (
                  <Button size="sm" variant="ghost" onClick={() => setDialog("waive")}>
                    Waive
                  </Button>
                )}
                {a.feeStatus === "PAID" && (
                  <Button size="sm" variant="outline" icon={<Icon name="printer" size={14} />} onClick={receipt}>
                    Receipt
                  </Button>
                )}
              </div>
            </div>
            <p style={{ margin: 0 }}>
              {a.feeStatus === "NONE" ? (
                <span className={styles.muted}>{a.stage === "ENQUIRY" ? "Added when the enquiry becomes an application." : "No fee for this class."}</span>
              ) : (
                <>
                  <strong>{inr(a.feeAmount)}</strong> ·{" "}
                  {a.feeStatus === "PAID" ? (
                    <Badge tone="success">Paid {a.feeMode === "ONLINE" ? "online" : `by ${a.feeMode?.toLowerCase().replace("_", " ")}`}</Badge>
                  ) : a.feeStatus === "WAIVED" ? (
                    <Badge tone="neutral">Waived</Badge>
                  ) : (
                    <Badge tone="warning">Not paid</Badge>
                  )}
                  {a.feeReceiptNo && <span className={styles.muted}> · {a.feeReceiptNo} · {when(a.feePaidAt)}</span>}
                  {a.feeWaiveReason && <span className={styles.muted}> · {a.feeWaiveReason}</span>}
                </>
              )}
            </p>
          </section>

          <section className={styles.block}>
            <div className={styles.blockHead}>
              <h4>Documents from the family</h4>
            </div>
            {a.files.length === 0 ? (
              <p className={styles.muted} style={{ margin: 0 }}>
                None attached.
              </p>
            ) : (
              <ul className={styles.list}>
                {a.files.map((f) => (
                  <li key={f.id} className={styles.listItem}>
                    <div className={styles.listMain}>
                      <span className={styles.strong}>{f.label}</span>{" "}
                      <span className={styles.muted}>
                        · {f.isPdf ? "PDF" : "photo"}
                        {f.moved ? " · on the student's record" : ""}
                      </span>
                    </div>
                    <Button size="sm" variant="outline" icon={<Icon name="eye" size={14} />} onClick={() => setViewing(f)}>
                      View
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <NotesBlock application={a} canEdit={canManage} />

          <section className={styles.block}>
            <div className={styles.blockHead}>
              <h4>History</h4>
            </div>
            <ul className={styles.timeline}>
              {a.events.map((e) => (
                <li key={e.id}>
                  <span className={styles.muted}>{when(e.createdAt)}</span>
                  <span>
                    <strong>{ACTION_TEXT[e.action] ?? e.action}</strong>
                    {e.note ? ` — ${e.note}` : ""} <span className={styles.muted}>· {e.by}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}

      {a && dialog === "edit" && <ApplicationForm mode="EDIT" application={a} defaultSessionId={a.sessionId} onClose={() => setDialog(null)} />}
      {a && dialog === "apply" && <ApplicationForm mode="APPLY" application={a} defaultSessionId={a.sessionId} onClose={() => setDialog(null)} />}
      {a && dialog === "schedule" && <ScheduleDialog a={a} onClose={() => setDialog(null)} />}
      {a && dialog === "result" && <ResultDialog a={a} onClose={() => setDialog(null)} />}
      {a && (dialog === "reject" || dialog === "withdraw") && <ReasonDialog a={a} kind={dialog} onClose={() => setDialog(null)} />}
      {a && dialog === "fee" && <FeeDialog a={a} onClose={() => setDialog(null)} />}
      {a && dialog === "waive" && <WaiveDialog a={a} onClose={() => setDialog(null)} />}
      {a && dialog === "admit" && <AdmitDialog a={a} onClose={() => setDialog(null)} onAdmitted={(sid) => navigate(`/admin/students/${sid}`)} />}
      {viewing && <FileDialog file={viewing} onClose={() => setViewing(null)} />}
    </Modal>
  );
};

// ---------------------------------------------------------------------------

const Actions = ({ onClose, busy, disabled, label, danger, onSave }: { onClose: () => void; busy: boolean; disabled?: boolean; label: string; danger?: boolean; onSave: () => void }) => (
  <div className={styles.actions}>
    <Button variant="ghost" onClick={onClose}>
      Cancel
    </Button>
    <Button variant={danger ? "danger" : "primary"} isLoading={busy} disabled={disabled} onClick={onSave}>
      {label}
    </Button>
  </div>
);

const useStage = (id: number, onClose: () => void) => {
  const [stage, { isLoading }] = useChangeApplicationStageMutation();
  const run = async (body: Record<string, unknown>, done: string) => {
    try {
      await stage({ id, action: String(body.action), ...body }).unwrap();
      toast.success(done);
      onClose();
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't save"));
    }
  };
  return { run, isLoading };
};

const NotesBlock = ({ application, canEdit }: { application: Application; canEdit: boolean }) => {
  const [notes, setNotes] = useState(application.officeNotes ?? "");
  const [update, { isLoading }] = useUpdateApplicationMutation();
  useEffect(() => setNotes(application.officeNotes ?? ""), [application.officeNotes]);
  const dirty = notes !== (application.officeNotes ?? "");
  return (
    <section className={styles.block}>
      <div className={styles.blockHead}>
        <h4>Office notes</h4>
        {canEdit && dirty && (
          <Button
            size="sm"
            isLoading={isLoading}
            onClick={async () => {
              try {
                await update({ id: application.id, officeNotes: notes }).unwrap();
                toast.success("Notes saved");
              } catch (e) {
                toast.error(getErrorMessage(e, "Couldn't save"));
              }
            }}
          >
            Save notes
          </Button>
        )}
      </div>
      <textarea className={styles.textarea} value={notes} disabled={!canEdit} maxLength={2000} placeholder="Calls, visit, anything to remember — not shown to the family" onChange={(e) => setNotes(e.target.value)} />
    </section>
  );
};

const ScheduleDialog = ({ a, onClose }: { a: Application; onClose: () => void }) => {
  const [at, setAt] = useState(a.testAt ? localDateTime(new Date(a.testAt)) : localDateTime());
  const [venue, setVenue] = useState(a.testVenue ?? "");
  const { run, isLoading } = useStage(a.id, onClose);
  return (
    <Modal title={a.stage === "TEST" ? "Reschedule test / interview" : "Schedule test / interview"} size="sm" onClose={onClose}>
      <p className={styles.muted}>The family sees the date, time and place when they check the status online. Call them too.</p>
      <div className={styles.formGrid}>
        <div className={styles.wide}>
          <Input label="Date and time" type="datetime-local" required value={at} onChange={(e) => setAt(e.target.value)} />
        </div>
        <div className={styles.wide}>
          <Input label="Where" value={venue} placeholder="e.g. Principal's office" onChange={(e) => setVenue(e.target.value)} />
        </div>
      </div>
      <Actions onClose={onClose} busy={isLoading} disabled={!at} label="Save" onSave={() => run({ action: "SCHEDULE", testAt: new Date(at).toISOString(), testVenue: venue }, "Scheduled")} />
    </Modal>
  );
};

const ResultDialog = ({ a, onClose }: { a: Application; onClose: () => void }) => {
  const [result, setResult] = useState("");
  const [remarks, setRemarks] = useState("");
  const { run, isLoading } = useStage(a.id, onClose);
  return (
    <Modal title="Test / interview result" size="sm" onClose={onClose}>
      <p className={styles.muted}>Passed moves the child to "Selected". Not passed or absent stays here, so you can reschedule or reject.</p>
      <div className={styles.formGrid}>
        <div className={styles.wide}>
          <Select
            label="Result"
            required
            value={result}
            onChange={(e) => setResult(e.target.value)}
            options={[
              { label: "Choose…", value: "" },
              { label: "Passed", value: "PASS" },
              { label: "Not passed", value: "FAIL" },
              { label: "Absent", value: "ABSENT" },
            ]}
          />
        </div>
        <div className={styles.wide}>
          <Input label="Remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        </div>
      </div>
      <Actions onClose={onClose} busy={isLoading} disabled={!result} label="Save" onSave={() => run({ action: "RESULT", testResult: result, testRemarks: remarks }, "Result saved")} />
    </Modal>
  );
};

const ReasonDialog = ({ a, kind, onClose }: { a: Application; kind: "reject" | "withdraw"; onClose: () => void }) => {
  const [note, setNote] = useState("");
  const { run, isLoading } = useStage(a.id, onClose);
  return (
    <Modal title={kind === "reject" ? "Reject application?" : "Mark as withdrawn?"} size="sm" onClose={onClose}>
      <p className={styles.muted}>You can reopen it later. Documents the family attached are deleted 90 days after it's closed.</p>
      <Input label="Reason" required value={note} placeholder={kind === "reject" ? "e.g. No seats in this class" : "e.g. Family chose another school"} onChange={(e) => setNote(e.target.value)} />
      <Actions onClose={onClose} busy={isLoading} danger disabled={note.trim().length < 3} label={kind === "reject" ? "Reject" : "Mark withdrawn"} onSave={() => run({ action: kind === "reject" ? "REJECT" : "WITHDRAW", note }, "Saved")} />
    </Modal>
  );
};

const FeeDialog = ({ a, onClose }: { a: Application; onClose: () => void }) => {
  const [mode, setMode] = useState("CASH");
  const [reference, setReference] = useState("");
  const [record, { isLoading }] = useRecordRegistrationFeeMutation();
  const needsRef = mode !== "CASH";
  return (
    <Modal title={`Receive ${inr(a.feeAmount)} registration fee`} size="sm" onClose={onClose}>
      <div className={styles.formGrid}>
        <Select
          label="Paid by"
          value={mode}
          onChange={(e) => setMode(e.target.value)}
          options={[
            { label: "Cash", value: "CASH" },
            { label: "UPI", value: "UPI" },
            { label: "Bank transfer", value: "BANK_TRANSFER" },
            { label: "Cheque", value: "CHEQUE" },
          ]}
        />
        <Input label={mode === "CHEQUE" ? "Cheque no." : "Reference"} required={needsRef} value={reference} disabled={!needsRef} onChange={(e) => setReference(e.target.value)} />
      </div>
      <p className={styles.muted}>A receipt number is given and the fee appears in Accounts as income.</p>
      <Actions
        onClose={onClose}
        busy={isLoading}
        disabled={needsRef && !reference.trim()}
        label="Save"
        onSave={async () => {
          try {
            await record({ id: a.id, mode, reference: needsRef ? reference.trim() : undefined }).unwrap();
            toast.success("Fee recorded — print the receipt from the application");
            onClose();
          } catch (e) {
            toast.error(getErrorMessage(e, "Couldn't record the fee"));
          }
        }}
      />
    </Modal>
  );
};

const WaiveDialog = ({ a, onClose }: { a: Application; onClose: () => void }) => {
  const [reason, setReason] = useState("");
  const [waive, { isLoading }] = useWaiveRegistrationFeeMutation();
  return (
    <Modal title={`Waive the ${inr(a.feeAmount)} registration fee?`} size="sm" onClose={onClose}>
      <Input label="Reason" required value={reason} placeholder="e.g. Staff child" onChange={(e) => setReason(e.target.value)} />
      <Actions
        onClose={onClose}
        busy={isLoading}
        disabled={reason.trim().length < 3}
        label="Waive"
        onSave={async () => {
          try {
            await waive({ id: a.id, reason: reason.trim() }).unwrap();
            toast.success("Fee waived");
            onClose();
          } catch (e) {
            toast.error(getErrorMessage(e, "Couldn't waive the fee"));
          }
        }}
      />
    </Modal>
  );
};

const AdmitDialog = ({ a, onClose, onAdmitted }: { a: Application; onClose: () => void; onAdmitted: (studentId: number) => void }) => {
  const { data: prefill, isLoading } = useGetAdmitPrefillQuery(a.id);
  const [form, setForm] = useState({ classSectionId: "", admissionNo: "", rollNo: "", admissionDate: "" });
  const [admit, { isLoading: saving }] = useAdmitApplicationMutation();
  useEffect(() => {
    if (!prefill) return;
    const match = prefill.sections.find((s) => s.className === a.className);
    setForm({ classSectionId: match ? String(match.id) : "", admissionNo: prefill.admissionNo, rollNo: match?.nextRollNo ?? "", admissionDate: prefill.admissionDate });
  }, [prefill, a.className]);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const feeBlocks = a.feeStatus === "UNPAID";

  return (
    <Modal title={`Admit ${a.studentName}`} size="md" onClose={onClose}>
      {isLoading || !prefill ? (
        <Spinner />
      ) : !prefill.sections.length ? (
        <EmptyState
          title={`No classes set up in ${a.session?.name ?? "this session"} yet`}
          description="Set up the classes for that session first (Settings → Academic sessions → copy last year's setup), then admit."
        />
      ) : (
        <>
          {feeBlocks && <p className={styles.danger}>The registration fee isn't paid yet. Record the payment first.</p>}
          <p className={styles.muted}>
            This creates the student record with their login, using the details on the application. Attached documents move onto the student. Applied for: {a.className}.
          </p>
          <div className={styles.formGrid}>
            <div className={styles.wide}>
              <Select
                label="Class and section"
                required
                value={form.classSectionId}
                onChange={(e) => {
                  const s = prefill.sections.find((x) => String(x.id) === e.target.value);
                  setForm((f) => ({ ...f, classSectionId: e.target.value, rollNo: s?.nextRollNo ?? f.rollNo }));
                }}
                options={[{ label: "Choose…", value: "" }, ...prefill.sections.map((s) => ({ label: `${s.label} (${s.students} students)`, value: String(s.id) }))]}
              />
            </div>
            <Input label="Admission number" required value={form.admissionNo} onChange={(e) => set("admissionNo", e.target.value)} />
            <Input label="Roll number" required value={form.rollNo} onChange={(e) => set("rollNo", e.target.value)} />
            <Input label="Admission date" type="date" required value={form.admissionDate} onChange={(e) => set("admissionDate", e.target.value)} />
          </div>
          <Actions
            onClose={onClose}
            busy={saving}
            disabled={feeBlocks || !form.classSectionId || !form.admissionNo.trim() || !form.rollNo.trim()}
            label="Admit"
            onSave={async () => {
              try {
                const res = await admit({ id: a.id, classSectionId: Number(form.classSectionId), admissionNo: form.admissionNo.trim(), rollNo: form.rollNo.trim(), admissionDate: form.admissionDate }).unwrap();
                toast.success(`${a.studentName} admitted — ${res.admissionNo}`);
                onAdmitted(res.studentId);
              } catch (e) {
                toast.error(getErrorMessage(e, "Couldn't admit"));
              }
            }}
          />
        </>
      )}
    </Modal>
  );
};

const FileDialog = ({ file, onClose }: { file: Application["files"][number]; onClose: () => void }) => {
  const [open, { data, isLoading, isError, error }] = useOpenApplicationFileMutation();
  useEffect(() => {
    open(file.id);
  }, [file.id, open]);
  useEffect(() => () => void (data?.url && URL.revokeObjectURL(data.url)), [data?.url]);
  return (
    <Modal title={file.label} size="lg" onClose={onClose}>
      {isLoading || (!data && !isError) ? (
        <Spinner />
      ) : isError || !data ? (
        <EmptyState title="Couldn't open the file" description={getErrorMessage(error, "Try again in a minute.")} />
      ) : (
        <div className={styles.preview}>{data.type.startsWith("image/") ? <img src={data.url} alt={file.label} /> : <iframe src={data.url} title={file.label} />}</div>
      )}
    </Modal>
  );
};

export default ApplicationModal;
