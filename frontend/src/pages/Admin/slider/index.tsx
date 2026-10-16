import React, { useCallback, useState } from "react";
import AddSlider from "./manipulate";
import { DataTable } from "../../../components/DataTable";
import Button from "../../../components/Button";
import styles from "./slider.module.css";
import { motion } from "framer-motion";
import DeleteDialog from "./DeleteDialog";
import {
  useGetSlidersQuery,
  useCreateSlidersMutation,
  useUpdateSlidersMutation,
  useDeleteSlidersMutation,
} from "../../../store/services/sliders.api";
import { toast } from "react-toastify";

interface RowData {
  id: number;
  title: string;
  description: string;
  image: File;
}

const ListSlider: React.FC = () => {
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
    data: submenuData,
    isLoading: isDataLoading,
    refetch,
  } = useGetSlidersQuery({ limit, offset, search });
  const [createSlider] = useCreateSlidersMutation();
  const [updateSlider] = useUpdateSlidersMutation();
  const [deleteSlider] = useDeleteSlidersMutation();

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
    { label: "Title", accessor: "title" },
    { label: "Description", accessor: "description" },
    { label: "Image", accessor: "image" },
  ];

  const fetchData = useCallback(
    async (params?: { page: number; search?: string }) => {
      const page = params?.page || 1;
      const search = params?.search || "";
      setPage(page);
      setSearch(search);
      return {
        data: submenuData?.data || [],
        total: submenuData?.total || 0,
      };
    },
    [submenuData]
  );

  const handleDelete = async () => {
    setIsLoading(true);
    try {
      if (selectedId) {
        await deleteSlider({ id: selectedId }).unwrap();
        toast.success("Slider deleted successfully");
        refetch();
      }
    } catch (error) {
      console.error("Delete failed:", error);
      toast.error("Failed to delete Slider");
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
        await createSlider(formData).unwrap();
        toast.success("Slider created successfully");
      } else if (mode === "EDIT") {
        // Handle FormData vs regular object differently
        if (formData instanceof FormData) {
          // If it's FormData (with new image), append the ID
          formData.append("id", defaultValues.id?.toString() || "");
          await updateSlider(formData).unwrap();
        } else {
          // If it's regular object (no new image), add ID to object
          await updateSlider({ ...formData, id: defaultValues.id }).unwrap();
        }
        toast.success("Slider updated successfully");
      }
      refetch();
    } catch (error) {
      console.error("Submit failed:", error);
      toast.error(`Failed to ${mode === "ADD" ? "create" : "update"} slider`);
    } finally {
      setIsLoading(false);
      setIsOpen(false);
      setDefaultValues({});
    }
  };

  return (
    <div className={styles.menu}>
      <motion.div
        initial="hidden"
        animate="visible"
        variants={itemVariants}
        className={styles.formContainer}
      >
        <div className={styles.header}>
          <h1 className={styles.title}>Slider Management</h1>
          <Button
            type="button"
            isLoading={isLoading}
            buttonType="primary"
            title="+ Add New Slider"
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
                // For edit mode, we need to exclude the image from defaultValues
                // since we can't pre-populate file inputs
                const { image, ...editValues } = row as RowData;
                setDefaultValues(editValues);
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

      <AddSlider
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

export default ListSlider;
