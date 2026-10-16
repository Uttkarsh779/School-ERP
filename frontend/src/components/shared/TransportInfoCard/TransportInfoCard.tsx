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
  onAssignTransport?: () => void;
}

const TransportInfoCard = ({ student, onAssignTransport }: TransportInfoCardProps) => {
  const route = student.transportRoute;

  if (!route) {
    return (
      <FormSection title="Transport Details">
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <EmptyState
            title="Not using school transport"
            description="This student isn't assigned to a transport route."
          />
          {onAssignTransport && (
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Button size="sm" icon={<Icon name="plus" />} onClick={onAssignTransport}>
                Assign Transport Route
              </Button>
            </div>
          )}
        </div>
      </FormSection>
    );
  }

  const vehicles = route.vehicles ?? [];

  return (
    <FormSection title="Transport Details">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <Badge tone="info">School Transport Active</Badge>
        {onAssignTransport && (
          <Button size="sm" variant="outline" icon={<Icon name="edit" />} onClick={onAssignTransport}>
            Change Route
          </Button>
        )}
      </div>

      <div className={styles.row}>
        <Field label="Route Name" value={route.routeName} />
        <Field label="Route Stops" value={route.stops} />
        {vehicles.length > 0 ? (
          vehicles.map((v) => (
            <React.Fragment key={v.id}>
              <Field label="Bus / Vehicle" value={`${v.vehicleNo}${v.capacity ? ` (${v.capacity} Seats)` : ""}`} />
              <Field label="Driver Name" value={v.driverName ?? "—"} />
              <Field label="Driver Contact" value={v.driverContact ?? "—"} />
            </React.Fragment>
          ))
        ) : (
          <Field label="Vehicle" value="No vehicle assigned to this route yet" />
        )}
      </div>
    </FormSection>
  );
};

export default TransportInfoCard;
