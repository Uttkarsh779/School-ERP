import { useState, type ReactNode } from "react";
import { toast } from "react-toastify";
import { Button, Card, ConfirmDialog, EmptyState, Icon, Input, Modal, Spinner } from "../../../../../components/ui";
import { useCan } from "../../../../../store/permissions";
import {
  useAddHealthCheckupMutation,
  useAddVaccinationMutation,
  useDeleteHealthCheckupMutation,
  useDeleteVaccinationMutation,
  useGetStudentHealthQuery,
  useSaveStudentHealthMutation,
  type HealthCheckup,
  type HealthProfile,
  type StudentHealth,
  type Vaccination,
} from "../../../../../store/api/studentRecords.api";
import HealthAlertBox from "./HealthAlert";
import styles from "./Records.module.css";

const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : "—");
const today = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};
const errorText = (e: unknown, fallback: string) => (e as { data?: { message?: string } } | undefined)?.data?.message ?? fallback;
const dash = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));

type FieldDef = { key: keyof HealthProfile; label: string; long?: boolean; placeholder?: string; type?: string };
const SECTIONS: Array<{ title: string; fields: FieldDef[] }> = [
  {
    title: "Health",
    fields: [
      { key: "allergies", label: "Allergies", long: true, placeholder: "e.g. Peanuts (severe), dust" },
      { key: "conditions", label: "Medical conditions", long: true, placeholder: "e.g. Asthma, epilepsy, diabetes" },
      { key: "medicines", label: "Medicines taken regularly", long: true },
      { key: "emergencyMedicine", label: "Emergency medicine", long: true, placeholder: "e.g. Inhaler — kept in school bag" },
      { key: "dietary", label: "Diet", placeholder: "e.g. Vegetarian, no gluten" },
      { key: "disability", label: "Disability / special needs", placeholder: "Leave empty if none" },
    ],
  },
  {
    title: "Family doctor",
    fields: [
      { key: "doctorName", label: "Doctor's name" },
      { key: "doctorPhone", label: "Doctor's phone", type: "tel" },
    ],
  },
  {
    title: "Emergency contact (if parents can't be reached)",
    fields: [
      { key: "emergencyName", label: "Name" },
      { key: "emergencyRelation", label: "Relation", placeholder: "e.g. Uncle" },
      { key: "emergencyPhone", label: "Phone", type: "tel" },
    ],
  },
];
const OFFICE_NOTES: FieldDef = { key: "officeNotes", label: "Office notes (not shown to the family or teachers)", long: true };

// Read-only facts, used by the office tab and the family view.
export const HealthFacts = ({ health, showOfficeNotes }: { health: StudentHealth; showOfficeNotes?: boolean }) => {
  const p = health.profile;
  const rows: Array<[string, ReactNode]> = [
    ["Blood group", dash(health.bloodGroup)],
    ["Medicines taken regularly", dash(p.medicines)],
    ["Disability / special needs", dash(p.disability)],
    ["Family doctor", p.doctorName || p.doctorPhone ? [p.doctorName, p.doctorPhone].filter(Boolean).join(" · ") : "—"],
    [
      "Emergency contact",
      p.emergencyName || p.emergencyPhone ? [p.emergencyName, p.emergencyRelation && `(${p.emergencyRelation})`, p.emergencyPhone].filter(Boolean).join(" ") : "—",
    ],
  ];
  if (showOfficeNotes) rows.push(["Office notes", dash(p.officeNotes)]);
  return (
    <div className={styles.stack}>
      <HealthAlertBox alert={p} />
      <dl className={styles.facts}>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
};

export const CheckupTable = ({ checkups, onDelete }: { checkups: HealthCheckup[]; onDelete?: (c: HealthCheckup) => void }) => (
  <div className={styles.tableWrap}>
    <table className={styles.table}>
      <thead>
        <tr>
          <th>Date</th>
          <th>Height</th>
          <th>Weight</th>
          <th>BMI</th>
          <th>Eyesight (L / R)</th>
          <th>Teeth</th>
          <th>Notes</th>
          {onDelete && <th aria-label="Actions" />}
        </tr>
      </thead>
      <tbody>
        {checkups.map((c) => (
          <tr key={c.id}>
            <td>{fmt(c.checkupDate)}</td>
            <td>{c.heightCm !== null ? `${c.heightCm} cm` : "—"}</td>
            <td>{c.weightKg !== null ? `${c.weightKg} kg` : "—"}</td>
            <td>{dash(c.bmi)}</td>
            <td>{c.visionLeft || c.visionRight ? `${dash(c.visionLeft)} / ${dash(c.visionRight)}` : "—"}</td>
            <td className={styles.wrap}>{dash(c.dental)}</td>
            <td className={styles.wrap}>{dash(c.notes)}</td>
            {onDelete && (
              <td>
                <Button size="sm" variant="ghost" onClick={() => onDelete(c)}>
                  Delete
                </Button>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export const VaccinationList = ({ vaccinations, onDelete }: { vaccinations: Vaccination[]; onDelete?: (v: Vaccination) => void }) => (
  <div>
    {vaccinations.map((v) => (
      <div key={v.id} className={styles.row}>
        <div className={styles.rowMain}>
          <div className={styles.rowTitle}>
            {v.vaccine}
            {v.dose ? ` · ${v.dose}` : ""}
          </div>
          <div className={styles.muted}>
            {v.givenOn ? `Given ${fmt(v.givenOn)}` : "Date not known"}
            {v.notes ? ` · ${v.notes}` : ""}
          </div>
        </div>
        {onDelete && (
          <Button size="sm" variant="ghost" onClick={() => onDelete(v)}>
            Delete
          </Button>
        )}
      </div>
    ))}
  </div>
);

// Office and Principal: the full health record.
const HealthTab = ({ studentId }: { studentId: number }) => {
  const can = useCan();
  const canEdit = can("health.edit");
  const { data, isLoading, isError, refetch } = useGetStudentHealthQuery(studentId);
  const [editing, setEditing] = useState(false);
  const [addingCheckup, setAddingCheckup] = useState(false);
  const [addingVaccine, setAddingVaccine] = useState(false);
  const [deleting, setDeleting] = useState<{ kind: "checkup"; row: HealthCheckup } | { kind: "vaccine"; row: Vaccination } | null>(null);
  const [deleteCheckup, { isLoading: delC }] = useDeleteHealthCheckupMutation();
  const [deleteVaccine, { isLoading: delV }] = useDeleteVaccinationMutation();

  if (isLoading) return <Spinner />;
  if (isError || !data)
    return <EmptyState title="Couldn't load the health record" description="Check your connection and try again." action={<Button variant="outline" onClick={() => refetch()}>Retry</Button>} />;

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      if (deleting.kind === "checkup") await deleteCheckup({ id: deleting.row.id, studentId }).unwrap();
      else await deleteVaccine({ id: deleting.row.id, studentId }).unwrap();
      toast.success("Deleted");
      setDeleting(null);
    } catch (e) {
      toast.error(errorText(e, "Couldn't delete"));
    }
  };

  return (
    <div className={styles.stack}>
      <Card
        title="Health record"
        subtitle={`Teachers of this class see the red alert only. ${data.updatedAt ? `Updated ${fmt(data.updatedAt)}.` : "Nothing recorded yet."}`}
        action={
          canEdit && (
            <Button size="sm" variant="outline" icon={<Icon name="edit" size={15} />} onClick={() => setEditing(true)}>
              Edit
            </Button>
          )
        }
      >
        <HealthFacts health={data} showOfficeNotes />
        <p className={styles.muted} style={{ marginTop: "0.8rem" }}>
          Blood group is edited with the student's details.
        </p>
      </Card>

      <Card
        title="Checkups"
        subtitle="Height, weight, eyesight and teeth"
        action={
          canEdit && (
            <Button size="sm" variant="outline" icon={<Icon name="plus" size={15} />} onClick={() => setAddingCheckup(true)}>
              Add checkup
            </Button>
          )
        }
      >
        {data.checkups.length ? (
          <CheckupTable checkups={data.checkups} onDelete={canEdit ? (row) => setDeleting({ kind: "checkup", row }) : undefined} />
        ) : (
          <EmptyState title="No checkups recorded" />
        )}
      </Card>

      <Card
        title="Vaccinations"
        action={
          canEdit && (
            <Button size="sm" variant="outline" icon={<Icon name="plus" size={15} />} onClick={() => setAddingVaccine(true)}>
              Add vaccination
            </Button>
          )
        }
      >
        {data.vaccinations.length ? (
          <VaccinationList vaccinations={data.vaccinations} onDelete={canEdit ? (row) => setDeleting({ kind: "vaccine", row }) : undefined} />
        ) : (
          <EmptyState title="No vaccinations recorded" />
        )}
      </Card>

      {editing && <EditHealthModal studentId={studentId} profile={data.profile} onClose={() => setEditing(false)} />}
      {addingCheckup && <CheckupModal studentId={studentId} onClose={() => setAddingCheckup(false)} />}
      {addingVaccine && <VaccinationModal studentId={studentId} onClose={() => setAddingVaccine(false)} />}
      {deleting && (
        <ConfirmDialog
          title={deleting.kind === "checkup" ? `Delete the checkup of ${fmt(deleting.row.checkupDate)}?` : `Delete ${deleting.row.vaccine}?`}
          message="This can't be undone."
          confirmLabel="Delete"
          isLoading={delC || delV}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
};

const TextArea = ({ label, value, placeholder, onChange }: { label: string; value: string; placeholder?: string; onChange: (v: string) => void }) => (
  <label className={`${styles.field} ${styles.wide}`}>
    <span className={styles.label}>{label}</span>
    <textarea className={styles.textarea} value={value} placeholder={placeholder} maxLength={500} rows={2} onChange={(e) => onChange(e.target.value)} />
  </label>
);

const EditHealthModal = ({ studentId, profile, onClose }: { studentId: number; profile: HealthProfile; onClose: () => void }) => {
  const [form, setForm] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(profile).map(([k, v]) => [k, v ?? ""])));
  const [save, { isLoading }] = useSaveStudentHealthMutation();
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    try {
      await save({ studentId, profile: form }).unwrap();
      toast.success("Health record saved");
      onClose();
    } catch (e) {
      toast.error(errorText(e, "Couldn't save"));
    }
  };

  const render = (f: FieldDef) =>
    f.long ? (
      <TextArea key={f.key} label={f.label} value={form[f.key] ?? ""} placeholder={f.placeholder} onChange={(v) => set(f.key, v)} />
    ) : (
      <Input key={f.key} label={f.label} type={f.type} value={form[f.key] ?? ""} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} />
    );

  return (
    <Modal title="Edit health record" size="lg" onClose={onClose}>
      <div className={styles.fields}>
        {SECTIONS.map((s) => (
          <div key={s.title} style={{ display: "contents" }}>
            <h4 className={styles.sectionTitle}>{s.title}</h4>
            {s.fields.map(render)}
          </div>
        ))}
        <h4 className={styles.sectionTitle}>Office</h4>
        {render(OFFICE_NOTES)}
      </div>
      <div className={styles.actions}>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button isLoading={isLoading} onClick={submit}>
          Save
        </Button>
      </div>
    </Modal>
  );
};

const CheckupModal = ({ studentId, onClose }: { studentId: number; onClose: () => void }) => {
  const [form, setForm] = useState({ checkupDate: today(), heightCm: "", weightKg: "", visionLeft: "", visionRight: "", dental: "", notes: "" });
  const [add, { isLoading }] = useAddHealthCheckupMutation();
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const submit = async () => {
    try {
      await add({ studentId, ...form }).unwrap();
      toast.success("Checkup added");
      onClose();
    } catch (e) {
      toast.error(errorText(e, "Couldn't save"));
    }
  };
  return (
    <Modal title="Add checkup" size="md" onClose={onClose}>
      <div className={styles.fields}>
        <Input label="Date" type="date" required max={today()} value={form.checkupDate} onChange={(e) => set("checkupDate", e.target.value)} />
        <div />
        <Input label="Height (cm)" type="number" inputMode="decimal" min={40} max={220} step="0.1" value={form.heightCm} onChange={(e) => set("heightCm", e.target.value)} />
        <Input label="Weight (kg)" type="number" inputMode="decimal" min={5} max={200} step="0.1" value={form.weightKg} onChange={(e) => set("weightKg", e.target.value)} />
        <Input label="Eyesight — left" placeholder="e.g. 6/6" value={form.visionLeft} onChange={(e) => set("visionLeft", e.target.value)} />
        <Input label="Eyesight — right" placeholder="e.g. 6/9" value={form.visionRight} onChange={(e) => set("visionRight", e.target.value)} />
        <div className={styles.wide}>
          <Input label="Teeth" placeholder="e.g. Healthy / 2 cavities" value={form.dental} onChange={(e) => set("dental", e.target.value)} />
        </div>
        <TextArea label="Notes" value={form.notes} onChange={(v) => set("notes", v)} />
      </div>
      <div className={styles.actions}>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button isLoading={isLoading} onClick={submit}>
          Save
        </Button>
      </div>
    </Modal>
  );
};

const VACCINES = ["BCG", "Hepatitis B", "OPV / Polio", "DPT", "MMR", "Typhoid", "Chickenpox (Varicella)", "Hepatitis A", "HPV", "Td / Tdap", "COVID-19"];

const VaccinationModal = ({ studentId, onClose }: { studentId: number; onClose: () => void }) => {
  const [form, setForm] = useState({ vaccine: "", dose: "", givenOn: "", notes: "" });
  const [add, { isLoading }] = useAddVaccinationMutation();
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const submit = async () => {
    try {
      await add({ studentId, ...form }).unwrap();
      toast.success("Vaccination added");
      onClose();
    } catch (e) {
      toast.error(errorText(e, "Couldn't save"));
    }
  };
  return (
    <Modal title="Add vaccination" size="sm" onClose={onClose}>
      <div className={styles.fields}>
        <div className={styles.wide}>
          <Input label="Vaccine" required list="vaccine-names" value={form.vaccine} onChange={(e) => set("vaccine", e.target.value)} />
          <datalist id="vaccine-names">
            {VACCINES.map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
        </div>
        <Input label="Dose" placeholder="e.g. 2nd, booster" value={form.dose} onChange={(e) => set("dose", e.target.value)} />
        <Input label="Date given" type="date" max={today()} value={form.givenOn} onChange={(e) => set("givenOn", e.target.value)} />
        <div className={styles.wide}>
          <Input label="Notes" value={form.notes} onChange={(e) => set("notes", e.target.value)} />
        </div>
      </div>
      <div className={styles.actions}>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button isLoading={isLoading} disabled={!form.vaccine.trim()} onClick={submit}>
          Save
        </Button>
      </div>
    </Modal>
  );
};

export default HealthTab;
