import { Modal } from "../../../../components/ui";
import ExportButton from "../../../../components/shared/ExportButton";

// Student exports: the plain list, the UDISE+ return and the CBSE LOC for Class X.
// These carry children's personal data; every download is recorded in the audit log.
const Row = ({ title, text, children }: { title: string; text: string; children: React.ReactNode }) => (
  <div style={{ display: "flex", gap: "0.9rem", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", padding: "0.85rem 0", borderBottom: "1px solid var(--erp-border, #e5e8ec)" }}>
    <div style={{ flex: "1 1 260px", minWidth: 0 }}>
      <strong>{title}</strong>
      <div style={{ fontSize: "0.86rem", color: "var(--erp-text-muted)", marginTop: 2, lineHeight: 1.45 }}>{text}</div>
    </div>
    {children}
  </div>
);

const StudentExportsModal = ({ status, onClose }: { status: "ALL" | "ACTIVE" | "INACTIVE"; onClose: () => void }) => (
  <Modal title="Export students" onClose={onClose}>
    <div>
      <Row
        title="Student list"
        text={`${status === "ALL" ? "All students" : status === "ACTIVE" ? "Current students" : "Students who left"} in this session: class, contacts, parents, IDs (Aadhaar masked), transport.`}
      >
        <ExportButton path="students" params={{ status: status === "ALL" ? "all" : status === "ACTIVE" ? "active" : "left" }} label="Download" variant="primary" />
      </Row>
      <Row
        title="UDISE+ student data"
        text="Every current student with the fields UDISE+ asks for, plus a sheet of who is missing what. Grey columns aren't stored in the ERP. Includes full Aadhaar numbers."
      >
        <ExportButton path="udise-students" label="Download" />
      </Row>
      <Row
        title="CBSE LOC — Class X"
        text="Class 10 candidates for board registration, with subjects, plus a 'fix before LOC' sheet (APAAR ID is mandatory; photos, names, category)."
      >
        <ExportButton path="cbse-loc" label="Download" />
      </Row>
      <p style={{ margin: "0.9rem 0 0", fontSize: "0.82rem", color: "var(--erp-text-muted)", lineHeight: 1.5 }}>
        These files contain children's personal data. Keep them on school computers only, don't share them on WhatsApp or email, and delete copies once uploaded.
        Each download is recorded with your name.
      </p>
    </div>
  </Modal>
);

export default StudentExportsModal;
