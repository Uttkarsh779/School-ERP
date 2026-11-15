import { useMemo, useState } from "react";
import { Badge, Icon } from "../../../../components/ui";

type StudentLite = { id: number; name: string; admissionNo: string; isActive?: boolean; classSection?: { className: string; section: string } | null };

// Sibling discount: the admin names the brother(s) / sister(s) studying in the school.
// Search by name or admission number; chosen siblings show as removable chips.
const SiblingPicker = ({
  students,
  excludeId,
  value,
  onChange,
}: {
  students: StudentLite[];
  excludeId?: string;
  value: string[];
  onChange: (ids: string[]) => void;
}) => {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const chosen = value.map((id) => students.find((s) => String(s.id) === id)).filter((s): s is StudentLite => !!s);
  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return students
      .filter((s) => s.isActive !== false && String(s.id) !== excludeId && !value.includes(String(s.id)))
      .filter((s) => s.name.toLowerCase().includes(q) || s.admissionNo.toLowerCase().includes(q))
      .slice(0, 8);
  }, [students, query, excludeId, value]);

  return (
    <div style={{ display: "grid", gap: "0.5rem", gridColumn: "1 / -1" }}>
      <label style={{ fontSize: "0.88rem", fontWeight: 600 }}>
        Sibling(s) in the school *
        <span style={{ display: "block", fontWeight: 400, fontSize: "0.8rem", color: "var(--erp-text-muted)" }}>
          The brother(s) or sister(s) this discount is given for. Kept on record with the discount.
        </span>
      </label>
      {chosen.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
          {chosen.map((s) => (
            <span
              key={s.id}
              style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", padding: "0.25rem 0.35rem 0.25rem 0.65rem", borderRadius: 99, background: "var(--erp-primary-50, #eef2ff)", fontSize: "0.85rem" }}
            >
              {s.name}
              {s.classSection && <span style={{ color: "var(--erp-text-muted)" }}>· {s.classSection.className}-{s.classSection.section}</span>}
              <button
                type="button"
                aria-label={`Remove ${s.name}`}
                onClick={() => onChange(value.filter((id) => id !== String(s.id)))}
                style={{ border: 0, background: "transparent", cursor: "pointer", display: "grid", placeItems: "center", padding: 2, color: "inherit" }}
              >
                <Icon name="x" size={14} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div style={{ position: "relative" }}>
        <input
          type="search"
          value={query}
          placeholder={excludeId ? "Type a sibling's name or admission no..." : "Choose the student first"}
          disabled={!excludeId}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          style={{ width: "100%", boxSizing: "border-box", font: "inherit", padding: "0.55rem 0.75rem", borderRadius: 8, border: "1px solid var(--erp-border, #cfd5dd)" }}
        />
        {open && query.trim() && (
          <div
            style={{
              position: "absolute", zIndex: 30, left: 0, right: 0, marginTop: 4, maxHeight: 240, overflowY: "auto",
              background: "var(--erp-surface, #fff)", border: "1px solid var(--erp-border)", borderRadius: "var(--erp-radius-sm, 6px)", boxShadow: "var(--erp-shadow-lg)",
            }}
          >
            {suggestions.length === 0 ? (
              <div style={{ padding: "0.7rem", fontSize: "0.85rem", color: "var(--erp-text-muted)", textAlign: "center" }}>No matching students</div>
            ) : (
              suggestions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange([...value, String(s.id)]);
                    setQuery("");
                  }}
                  style={{
                    width: "100%", textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8,
                    padding: "0.55rem 0.8rem", border: 0, borderBottom: "1px solid var(--erp-border-subtle, #eef0f3)", background: "transparent", cursor: "pointer", font: "inherit", fontSize: "0.88rem",
                  }}
                >
                  <span>
                    <strong>{s.name}</strong>
                    <span style={{ fontSize: "0.78rem", color: "var(--erp-text-muted)", marginLeft: 6 }}>Adm: {s.admissionNo}</span>
                  </span>
                  {s.classSection && <Badge tone="neutral">{s.classSection.className} - {s.classSection.section}</Badge>}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SiblingPicker;
