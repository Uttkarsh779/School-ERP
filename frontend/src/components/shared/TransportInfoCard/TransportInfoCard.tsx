import React from "react";
import { Badge, Button, EmptyState, FormSection, Icon } from "../../ui";
import styles from "./TransportInfoCard.module.css";

const Field = ({ label, value }: { label: string; value?: string | null }) => (
  <div className={styles.field}>
    <span className={styles.label}>{label}</span>
    <span className={styles.value}>{value || "—"}</span>
  </div>
);

interface TransportInfoCardProps {
  student: IStudent;
  // Current village / fee-location assignment (from the student's history), if any.
  activeAssignment?: { villageName: string | null; monthlyFee: number | null; startDate: string } | null;
  onAssignTransport?: () => void;
}

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : null);

// A student uses school transport when they have a bus route and/or an active village
// (fee-location) assignment; both are shown, and a missing half is called out.
const TransportInfoCard = ({ student, activeAssignment, onAssignTransport }: TransportInfoCardProps) => {
  const route = student.transportRoute;

  if (!route && !activeAssignment) {
    return (
      <FormSection title="Transport Details">
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <EmptyState title="Not using school transport" description="This student has no bus route or village transport assignment." />
          {onAssignTransport && (
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end" }}>
              <Button size="sm" icon={<Icon name="plus" />} onClick={onAssignTransport}>
                Assign Transport
              </Button>
            </div>
          )}
        </div>
      </FormSection>
    );
  }

  const vehicles = route?.vehicles ?? [];

  return (
    <FormSection title="Transport Details">
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
          <Badge tone="success">Using school transport</Badge>
          {!route && <Badge tone="warning">No bus route assigned</Badge>}
          {!activeAssignment && <Badge tone="warning">No village / fee location</Badge>}
        </div>
        {onAssignTransport && (
          <Button size="sm" variant="outline" icon={<Icon name="edit" />} onClick={onAssignTransport}>
            Manage Transport
          </Button>
        )}
      </div>

      <div className={styles.row}>
        <Field label="Village / Stop" value={activeAssignment?.villageName ?? "Not assigned"} />
        <Field label="Monthly Transport Fee" value={activeAssignment?.monthlyFee != null ? `₹${activeAssignment.monthlyFee.toLocaleString("en-IN")}` : null} />
        <Field label="Using Transport Since" value={fmt(activeAssignment?.startDate)} />
        <Field label="Route" value={route?.routeName ?? "Not assigned"} />
        {route && <Field label="Route Stops" value={route.stops} />}
        {route &&
          (vehicles.length > 0 ? (
            vehicles.map((v) => (
              <React.Fragment key={v.id}>
                <Field label="Bus / Vehicle" value={`${v.vehicleNo}${v.capacity ? ` (${v.capacity} Seats)` : ""}`} />
                <Field label="Driver Name" value={v.driverName ?? "—"} />
                <Field label="Driver Contact" value={v.driverContact ?? "—"} />
              </React.Fragment>
            ))
          ) : (
            <Field label="Vehicle" value="No vehicle assigned to this route yet" />
          ))}
      </div>
    </FormSection>
  );
};

export default TransportInfoCard;
