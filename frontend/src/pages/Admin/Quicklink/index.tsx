import React, { useCallback, useMemo, useState } from "react";
import AddQuickMenu from "./manipulate";
import { DataTable } from "../../../components/DataTable";
import Button from "../../../components/Button";
import styles from "./quickmenu.module.css";
import { motion } from "framer-motion";
import DeleteDialog from "./DeleteDialog";

import { toast } from "react-toastify";
import {
  useGetQuickMenuQuery,
  useCreateQuickMenuMutation,
  useUpdateQuickMenuMutation,
  useDeleteQuickMenuMutation,
} from "../../../store/services/quickMenu.api";

const QuickMenuData: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<"ADD" | "EDIT" | "DELETE">("ADD");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");

  const limit = 10;
  const offset = (page - 1) * limit;
  const [defaultValues, setDefaultValues] = useState<Partial<IFooterMenu>>({});
  const [isLoading, setIsLoading] = useState(false);

  // API hooks
  const {
    data: quickData,
    isLoading: isDataLoading,
    refetch,
  } = useGetQuickMenuQuery({ limit, offset, search });
  const [createQuick] = useCreateQuickMenuMutation();
  const [updateQuick] = useUpdateQuickMenuMutation();
  const [deleteQuick] = useDeleteQuickMenuMutation();

  const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.3 },
    },
  };

  const columns = useMemo(
    () => [
      { label: "Menu Name", accessor: "name" },
      { label: "Path / URL", accessor: "url" },
      { label: "Target", accessor: "target" },
      { label: "Order", accessor: "sorting_order" },
    ],
    []
  );

  const fetchData = useCallback(
    async (params?: { page: number; search?: string }) => {
      const page = params?.page || 1;
      const search = params?.search || "";
      setPage(page);
      setSearch(search);
      return {
        data: quickData?.data || [],
        total: quickData?.total || 0,
      };
    },
    [quickData]
  );

  const handleDelete = async () => {
    setIsLoading(true);
    try {
      if (selectedId) {
        await deleteQuick({ id: selectedId }).unwrap();
        toast.success("Menu item deleted successfully");
        refetch();
      }
    } catch (error) {
      console.error("Delete failed:", error);
      toast.error("Failed to delete menu item");
    } finally {
      setIsLoading(false);
      setIsOpen(false);
      setSelectedId(null);
    }
  };

  const handleSubmit = async (formData: any) => {
    setIsLoading(true);
    try {
      if (mode === "ADD") {
        await createQuick(formData).unwrap();
        toast.success("Menu item created successfully");
      } else if (mode === "EDIT") {
        await updateQuick({ ...formData, id: defaultValues.id }).unwrap();
        toast.success("Menu item updated successfully");
      }
      refetch();
    } catch (error) {
      console.error("Submit failed:", error);
      toast.error(
        `Failed to ${mode === "ADD" ? "create" : "update"} menu item`
      );
    } finally {
      setIsLoading(false);
      setIsOpen(false);
      setDefaultValues({});
    }
  };

  return (
    <div className={styles.main}>
      <motion.div
        initial="hidden"
        animate="visible"
        variants={itemVariants}
        className={styles.formContainer}
      >
        <div className={styles.header}>
          <h1 className={styles.title}>Quick Menu Management</h1>
          <Button
            type="button"
            isLoading={isLoading}
            buttonType="primary"
            title="+ Add New Menu"
            onClick={() => {
              setDefaultValues({});
              setIsOpen(true);
              setMode("ADD");
            }}
          />
        </div>

        <DataTable
          fetchData={fetchData}
          columns={columns}
          actions={[
            {
              label: "✏️",
              onClick: (row) => {
                setDefaultValues(row as RowData);
                setIsOpen(true);
                setMode("EDIT");
                console.log("Edit clicked:", row);
              },
            },
            {
              label: "🗑️",
              onClick: (row) => {
                setMode("DELETE");
                setSelectedId((row as RowData).id);
                setIsOpen(true);
                console.log("Delete clicked:", row);
              },
            },
          ]}
          isSearch={true}
          isExport={true}
          isNavigate={true}
          loading={isDataLoading}
        />
      </motion.div>

      <AddQuickMenu
        isOpen={isOpen && ["ADD", "EDIT"].includes(mode)}
        onClose={() => {
          setIsOpen(false);
          setDefaultValues({});
        }}
        defaultValues={defaultValues}
        mode={mode}
        onSubmitHandler={handleSubmit}
        isLoading={isLoading}
      />

      <DeleteDialog
        isOpen={isOpen && mode === "DELETE"}
        onClose={() => {
          setIsOpen(false);
          setSelectedId(null);
        }}
        onConfirm={handleDelete}
        isLoading={isLoading}
        title="Confirm Deletion"
        message="Are you sure you want to delete this menu item? This action cannot be undone."
      />
    </div>
  );
};

export default QuickMenuData;
