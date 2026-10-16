import React, { useCallback, useState } from "react";
import AddFaq from "./manipulate";
import { DataTable } from "../../../components/DataTable";
import Button from "../../../components/Button";
import styles from "./faq.module.css";
import { motion } from "framer-motion";
import DeleteDialog from "./DeleteDialog";
import {
  useGetFaqQuery,
  useCreateFaqMutation,
  useUpdateFaqMutation,
  useDeleteFaqMutation,
} from "../../../store/services/faq.api";
import { toast } from "react-toastify";

interface RowData {
  id: number;
  question: string;
  answer: string;
}

const FaqData: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<"ADD" | "EDIT" | "DELETE">("ADD");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [defaultValues, setDefaultValues] = useState<Partial<RowData>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");

  const limit = 10;
  const offset = (page - 1) * limit;
  // API hooks
  const {
    data: telephonicData,
    isLoading: isDataLoading,
    refetch,
  } = useGetFaqQuery({ limit, offset, search });
  const [createTelephonic] = useCreateFaqMutation();
  const [updateTelephonic] = useUpdateFaqMutation();
  const [deleteTelephonic] = useDeleteFaqMutation();

  const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.3 },
    },
  };

  const columns = [
    { label: "ID", accessor: "id" },
    { label: "Question", accessor: "question" },
    { label: "Answer", accessor: "answer" },
  ];

  const fetchData = useCallback(
    async (params?: { page: number; search?: string }) => {
      const page = params?.page || 1;
      const search = params?.search || "";
      setPage(page);
      setSearch(search);
      return {
        data: telephonicData?.data || [],
        total: telephonicData?.total || 0,
      };
    },
    [telephonicData]
  );

  const handleDelete = async () => {
    setIsLoading(true);
    try {
      if (selectedId) {
        await deleteTelephonic({ id: selectedId }).unwrap();
        toast.success("Record deleted successfully");
        refetch();
      }
    } catch (error) {
      console.error("Delete failed:", error);
      toast.error("Failed to delete record");
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
        await createTelephonic(formData).unwrap();
        toast.success("Record created successfully");
      } else if (mode === "EDIT") {
        await updateTelephonic({ ...formData, id: defaultValues.id }).unwrap();
        toast.success("Record updated successfully");
      }
      refetch();
    } catch (error) {
      console.error("Submit failed:", error);
      toast.error(`Failed to ${mode === "ADD" ? "create" : "update"} record`);
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
          <h1 className={styles.title}>Faq Management</h1>
          <Button
            type="button"
            isLoading={isLoading}
            buttonType="primary"
            title="+ Add New Faq"
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

      <AddFaq
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
        message="Are you sure you want to delete this record? This action cannot be undone."
      />
    </div>
  );
};

export default FaqData;
