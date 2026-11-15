import { useState } from "react";
import { toast } from "react-toastify";
import { Button, Icon, PageHeader } from "../../../../components/ui";
import ExportButton from "../../../../components/shared/ExportButton";
import { printTransportList } from "../../../../components/shared/Print/transportPrint";
import { useGetPublicWebsiteDataQuery } from "../../../../store/api/cms.api";
import { useLazyGetTransportRowsQuery } from "../../../../store/api/exports.api";
import { useCan } from "../../../../store/permissions";
import { AdminTransportVillagesSection } from "./AdminTransportVillagesSection";
import RoutesSection from "./RoutesSection";
import VehiclesSection from "./VehiclesSection";
import styles from "./AdminTransportPage.module.css";

const AdminTransportPage = () => {
  const [activeTab, setActiveTab] = useState<"villages" | "routes" | "vehicles">("villages");
  const can = useCan();
  const { data: site } = useGetPublicWebsiteDataQuery();
  const [fetchRows, { isFetching: loadingRows }] = useLazyGetTransportRowsQuery();

  // Route-wise list of students on transport, for drivers and the transport in-charge.
  const printList = async () => {
    try {
      const rows = await fetchRows().unwrap();
      if (!rows.length) return void toast.info("No students are using school transport right now");
      printTransportList(rows, { school: site?.settings });
    } catch (e: any) {
      toast.error(e?.data?.message ?? "Couldn't load the transport list");
    }
  };

  return (
    <div className={styles.section} style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <PageHeader
        title="Transportation Management"
        subtitle="Manage transport locations, student transport assignments, bus routes, and vehicles"
        actions={
          can("exports.students") ? (
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <Button variant="outline" icon={<Icon name="printer" size={16} />} isLoading={loadingRows} onClick={printList}>
                Print transport list
              </Button>
              <ExportButton path="transport" size="md" label="Excel" />
            </div>
          ) : undefined
        }
      />

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", borderBottom: "1px solid var(--erp-border)", marginBottom: "0.5rem" }}>
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
