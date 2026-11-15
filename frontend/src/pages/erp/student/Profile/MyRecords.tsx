import { Badge } from "../../../../components/ui";
import { useGetMyRecordsQuery } from "../../../../store/api/studentRecords.api";
import { DocumentChecklist } from "../../admin/Students/records/DocumentsTab";
import { CheckupTable, HealthFacts, VaccinationList } from "../../admin/Students/records/HealthTab";
import records from "../../admin/Students/records/Records.module.css";

const fmt = (d: string) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

// Family view of the health record kept by the school (read-only; office notes not shown).
export const MyHealth = () => {
  const { data, isLoading, isError } = useGetMyRecordsQuery();
  if (isLoading) return <p className={records.muted}>Loading…</p>;
  if (isError || !data) return <p className={records.muted}>Couldn't load the health record.</p>;
  const h = data.health;
  return (
    <div className={records.stack}>
      <HealthFacts health={h} />
      {h.checkups.length > 0 && (
        <div>
          <strong>Checkups</strong>
          <CheckupTable checkups={h.checkups} />
        </div>
      )}
      {h.vaccinations.length > 0 && (
        <div>
          <strong>Vaccinations</strong>
          <VaccinationList vaccinations={h.vaccinations} />
        </div>
      )}
    </div>
  );
};

// Which documents the school has on file, and which it still needs.
export const MyDocuments = () => {
  const { data, isLoading, isError } = useGetMyRecordsQuery();
  if (isLoading) return <p className={records.muted}>Loading…</p>;
  if (isError || !data) return <p className={records.muted}>Couldn't load the list.</p>;
  const { documents, checklist } = data.documents;
  const missing = checklist.filter((c) => c.status === "MISSING");
  return (
    <div className={records.stack}>
      {checklist.length > 0 && (
        <div>
          <p className={records.note}>
            {missing.length
              ? `The school still needs: ${missing.map((m) => m.label.toLowerCase()).join(", ")}. Please bring a copy to the office.`
              : "The school has every document it needs."}
          </p>
          <DocumentChecklist items={checklist} />
        </div>
      )}
      {documents.length === 0 ? (
        <p className={records.muted}>No documents on file yet.</p>
      ) : (
        <div>
          {documents.map((d) => (
            <div key={d.id} className={records.row}>
              <div className={records.rowMain}>
                <div className={records.rowTitle}>
                  {d.label}
                  {d.title ? ` · ${d.title}` : ""}
                </div>
                <div className={records.muted}>Received {fmt(d.createdAt)}</div>
              </div>
              {d.verified ? <Badge tone="success">Verified</Badge> : <Badge tone="warning">Being checked</Badge>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
