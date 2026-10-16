import { useState } from "react";
import { PageHeader } from "../../../../components/ui";
import { AdminTransportVillagesSection } from "./AdminTransportVillagesSection";
import RoutesSection from "./RoutesSection";
import VehiclesSection from "./VehiclesSection";
import styles from "./AdminTransportPage.module.css";

const AdminTransportPage = () => {
  const [activeTab, setActiveTab] = useState<"villages" | "routes" | "vehicles">("villages");

  return (
    <div className={styles.section} style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <PageHeader
        title="Transportation Management"
        subtitle="Manage transport locations, student transport assignments, bus routes, and vehicles"
      />

      <div style={{ display: "flex", gap: "0.5rem", borderBottom: "1px solid var(--erp-border)", marginBottom: "0.5rem" }}>
        <button
          type="button"
          style={{
            border: "none",
            background: "transparent",
            padding: "0.75rem 1.25rem",
            fontSize: "0.9rem",
            fontWeight: 600,
            color: activeTab === "villages" ? "var(--erp-primary-700)" : "var(--erp-text-muted)",
            borderBottom: activeTab === "villages" ? "2px solid var(--erp-primary-600)" : "2px solid transparent",
            cursor: "pointer",
          }}
          onClick={() => setActiveTab("villages")}
        >
          Locations & Student Assignments
        </button>
        <button
          type="button"
          style={{
            border: "none",
            background: "transparent",
            padding: "0.75rem 1.25rem",
            fontSize: "0.9rem",
            fontWeight: 600,
            color: activeTab === "routes" ? "var(--erp-primary-700)" : "var(--erp-text-muted)",
            borderBottom: activeTab === "routes" ? "2px solid var(--erp-primary-600)" : "2px solid transparent",
            cursor: "pointer",
          }}
          onClick={() => setActiveTab("routes")}
        >
          Bus Routes
        </button>
        <button
          type="button"
          style={{
            border: "none",
            background: "transparent",
            padding: "0.75rem 1.25rem",
            fontSize: "0.9rem",
            fontWeight: 600,
            color: activeTab === "vehicles" ? "var(--erp-primary-700)" : "var(--erp-text-muted)",
            borderBottom: activeTab === "vehicles" ? "2px solid var(--erp-primary-600)" : "2px solid transparent",
            cursor: "pointer",
          }}
          onClick={() => setActiveTab("vehicles")}
        >
          Vehicles & Drivers
        </button>
      </div>

      {activeTab === "villages" && <AdminTransportVillagesSection />}
      {activeTab === "routes" && <RoutesSection />}
      {activeTab === "vehicles" && <VehiclesSection />}
    </div>
  );
};

export default AdminTransportPage;
