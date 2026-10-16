import React, { useState, useCallback } from "react";
import { DataTable } from "../../../components/DataTable";
import Manipulate from "./Manipulate";
import Button from "../../../components/Button";
import styles from "./GalleryCategory.module.css";
import ConfirmDelete from "./ConfirmDelete";
import { motion } from "framer-motion";
import { toast } from "react-toastify";

import {
  useGetGalleryCategoriesQuery,
  useAddGalleryCategoryMutation,
  useUpdateGalleryCategoryMutation,
  useDeleteGalleryCategoryMutation,
} from "../../../store/services/galleryCategory.api";

export interface GalleryCategoryItem {
  id: number;
  title: string;
  description: string;
}

const GalleryCategory: React.FC = () => {
  const [modalData, setModalData] = useState<{
    mode: "add" | "edit";
    category?: GalleryCategoryItem;
  } | null>(null);

  const [targetToDelete, setTargetToDelete] =
    useState<GalleryCategoryItem | null>(null);

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");

  const {
    data: queryData,
    isLoading,
    refetch,
  } = useGetGalleryCategoriesQuery({
    limit: 10,
    offset: (page - 1) * 10,
    search,
  });

  const [addCategory, { isLoading: isAdding }] =
    useAddGalleryCategoryMutation();
  const [updateCategory, { isLoading: isUpdating }] =
    useUpdateGalleryCategoryMutation();
  const [deleteCategory, { isLoading: isDeleting }] =
    useDeleteGalleryCategoryMutation();

  const isMutating = isAdding || isUpdating || isDeleting;

  const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
  };

  const handleSave = useCallback(
    async (data: Omit<GalleryCategoryItem, "id"> & { id?: number }) => {
      try {
        if (data.id != null) {
          await updateCategory({
            id: data.id,
            body: { title: data.title, description: data.description },
          }).unwrap();
          toast.success(`Category "${data.title}" updated successfully`);
        } else {
          await addCategory({
            title: data.title,
            description: data.description,
          }).unwrap();
          toast.success(`Category "${data.title}" added successfully`);
        }
        setModalData(null);
        await refetch();
      } catch (error) {
        console.error("Failed to save category:", error);
        toast.error("Something went wrong while saving the category");
      }
    },
    [addCategory, updateCategory, refetch]
  );

  const handleDeleteConfirm = useCallback(async () => {
    if (!targetToDelete) return;
    try {
      await deleteCategory(targetToDelete.id).unwrap();
      toast.success(`Category "${targetToDelete.title}" deleted successfully`);
      setTargetToDelete(null);
      await refetch();
    } catch (error) {
      console.error("Failed to delete category:", error);
      toast.error("Failed to delete category");
    }
  }, [targetToDelete, deleteCategory, refetch]);

  const actions = [
    {
      label: "Edit",
      onClick: (row: GalleryCategoryItem) =>
        setModalData({ mode: "edit", category: row }),
    },
    {
      label: "Delete",
      onClick: (row: GalleryCategoryItem) => setTargetToDelete(row),
    },
  ];

  const fetchData = useCallback(
    async (params?: { page?: number; search?: string }) => {
      const newPage = params?.page ?? page;
      const newSearch = params?.search ?? search;
      setPage(newPage);
      setSearch(newSearch);

      return {
        data: queryData?.data || [],
        total: queryData?.total || 0,
      };
    },
    [queryData, page, search]
  );

  return (
    <div className={styles.container}>
      <motion.div
        initial="hidden"
        animate="visible"
        variants={itemVariants}
        className={styles.formContainer}
      >
        <div className={styles.header}>
          <h1 className={styles.title}>Gallery Categories</h1>
          <Button
            title="+ Add Category"
            buttonType="primary"
            onClick={() => setModalData({ mode: "add" })}
            disabled={isMutating}
          />
        </div>

        <DataTable
          fetchData={fetchData}
          columns={[
            { label: "ID", accessor: "id" },
            { label: "Title", accessor: "title" },
            { label: "Description", accessor: "description" },
          ]}
          actions={actions}
          loading={isLoading || isMutating}
          isNavigate
          isSearch
          isExport
        />

        {modalData && (
          <Manipulate
            mode={modalData.mode}
            category={modalData.category}
            onSave={handleSave}
            onClose={() => setModalData(null)}
            isLoading={isLoading}
          />
        )}

        {targetToDelete && (
          <ConfirmDelete
            title="Confirm Delete"
            message={`Are you sure you want to delete "${targetToDelete.title}"?`}
            onConfirm={handleDeleteConfirm}
            onCancel={() => setTargetToDelete(null)}
          />
        )}
      </motion.div>
    </div>
  );
};

export default GalleryCategory;
