import React, { useCallback, useState } from "react";
import { DataTable } from "../../../components/DataTable";
import Button from "../../../components/Button";
import styles from "./listpage.module.css";
import { motion } from "framer-motion";
import DeleteDialog from "./DeleteDialog";
import ManipulateListPage from "./manipulate";
import {
  useGetListpageQuery,
  useCreateListpageMutation,
  useUpdateListpageMutation,
  useDeleteListpageMutation,
} from "../../../store/services/listpage.api";
import { toast } from "react-toastify";

interface RowData {
  [key: string]: string | number;
  id: number;
  title: string;
  content: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

const ListPage: React.FC = () => {
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
    data: listpageData,
    isLoading: isDataLoading,
    refetch,
  } = useGetListpageQuery({ limit, offset, search });
  const [createListpage] = useCreateListpageMutation();
  const [updateListpage] = useUpdateListpageMutation();
  const [deleteListpage] = useDeleteListpageMutation();

  const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.3 },
    },
  };
  const fetchData = useCallback(
    async (params?: { page: number; search?: string }) => {
      const page = params?.page || 1;
      const search = params?.search || "";
      setPage(page);
      setSearch(search);
      return {
        data: listpageData?.data || [],
        total: listpageData?.total || 0,
      };
    },
    [listpageData]
  );

  const handleAdd = () => {
    setMode("ADD");
    setIsOpen(true);
    setDefaultValues({});
  };

  const handleClose = () => {
    setIsOpen(false);
    setSelectedId(null);
    setDefaultValues({});
  };

  const handleSubmit = async (values: Partial<RowData>) => {
    setIsLoading(true);
    try {
      if (mode === "ADD") {
        await createListpage(values).unwrap();
        toast.success("Page created successfully!");
      } else if (mode === "EDIT" && selectedId) {
        await updateListpage({ ...values, id: selectedId } as RowData).unwrap();
        toast.success("Page updated successfully!");
      }
      refetch();
      handleClose();
    } catch (error) {
      toast.error("An error occurred!");
    }
    setIsLoading(false);
  };

  const handleConfirmDelete = async () => {
    if (!selectedId) return;
    setIsLoading(true);
    try {
      await deleteListpage({ id: selectedId }).unwrap();
      toast.success("Page deleted successfully!");
      refetch();
      handleClose();
    } catch (error) {
      toast.error("An error occurred!");
    }
    setIsLoading(false);
  };

  const columns = [
    { label: "Title", accessor: "title" },
    { label: "Slug", accessor: "slug" },
    { label: "Meta Title", accessor: "MetaTitle" },
    { label: "Published", accessor: "publishDate" },
    { label: "Image", accessor: "image" },
  ];

  return (
    <div className={styles.main}>
      <motion.div
        initial="hidden"
        animate="visible"
        variants={itemVariants}
        className={styles.formContainer}
      >
        <div className={styles.header}>
          <h1 className={styles.title}>Page Management</h1>
          <Button
            type="button"
            isLoading={isLoading}
            buttonType="primary"
            title="+ Add New"
            onClick={handleAdd}
          />
        </div>

        <DataTable
          fetchData={fetchData}
          columns={columns}
          actions={[
            {
              label: "✏️",
              onClick: (row: { [x: string]: unknown }) => {
                const rowData: RowData = {
                  id: Number(row.id),
                  title: String(row.title),
                  content: String(row.content),
                  status: String(row.status),
                  createdAt: String(row.createdAt),
                  updatedAt: String(row.updatedAt),
                };
                setDefaultValues(rowData);
                setIsOpen(true);
                setMode("EDIT");
              },
            },
            {
              label: "🗑️",
              onClick: (row: { [x: string]: unknown }) => {
                setMode("DELETE");
                setSelectedId(Number(row.id));
                setIsOpen(true);
              },
            },
          ]}
          isSearch={true}
          isExport={true}
          loading={isDataLoading}
        />

        {mode !== "DELETE" ? (
          <ManipulateListPage
            isOpen={isOpen}
            onClose={handleClose}
            onSubmit={(values: Partial<RowData>) => handleSubmit(values)}
            mode={mode}
            defaultValues={defaultValues}
            isLoading={isLoading}
          />
        ) : (
          <DeleteDialog
            isOpen={isOpen}
            onClose={handleClose}
            onConfirm={handleConfirmDelete}
            isLoading={isLoading}
            itemName={defaultValues.title || ""}
          />
        )}
      </motion.div>
    </div>
  );
};

export default ListPage;
