
import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { motion } from 'framer-motion';
import styles from './slider.module.css';
import Button from '../../../components/Button';
import Input from '../../../components/Input';


// Validation schema
const schema = yup.object().shape({
  title: yup.string().required('Title is required'),
  description: yup.string().required('Description is required'),
  image: yup
    .mixed<File>()
    .test("fileExists", "Image is required for new entries", function(value) {
      const { parent } = this;
      // If it's an edit mode and no new file is selected, it's okay
      if (parent.mode === "EDIT" && !value) {
        return true;
      }
      // For ADD mode or when a file is provided, it should be a File
      return value instanceof File;
    }),
});

interface FormData {
  title: string;
  description: string;
  image: File;
}

interface AddSliderMenuProps {
  isOpen: boolean;
  onClose: () => void;
  defaultValues?: Partial<FormData>;
  mode: string;
  onSubmitHandler: (data: FormData) => void;
  isLoading?: boolean;
}

const AddSlider: React.FC<AddSliderMenuProps> = ({ 
  isOpen, 
  onClose, 
  defaultValues = {}, 
  mode, 
  onSubmitHandler,
  isLoading = false 
}) => {
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
  } = useForm<FormData>({
    resolver: yupResolver(schema) as any,
    defaultValues: {
      title: '',
      description: '',
      image: undefined as unknown as File,
      ...defaultValues,
    },
  });

  useEffect(() => {
    if (isOpen) {
      reset({
        title: '',
        description: '',
        image: undefined as unknown as File,
        ...defaultValues,
      });
    }
  }, [isOpen, defaultValues, reset]);

  const onSubmit = (data: FormData) => {
    console.log('Form data being submitted:', data);
    
    if (mode === "ADD") {
      // For ADD mode, create FormData for file upload
      const formData = new FormData();
      formData.append('title', data.title);
      formData.append('description', data.description);
      if (data.image) {
        formData.append('image', data.image);
      }
      onSubmitHandler(formData as any);
    } else {
      // For EDIT mode, handle differently based on whether image is updated
      if (data.image && data.image instanceof File) {
        // If new image is provided, use FormData
        const formData = new FormData();
        formData.append('title', data.title);
        formData.append('description', data.description);
        formData.append('image', data.image);
        onSubmitHandler(formData as any);
      } else {
        // If no new image, send JSON data
        const updateData = {
          title: data.title,
          description: data.description,
        };
        onSubmitHandler(updateData as any);
      }
    }
  };

  
  if (!isOpen) return null;

  return (
    <div className={styles.backdrop}>
      <motion.div
        className={styles.modalContainer}
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.8, opacity: 0 }}
      >
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>
            {mode === "ADD" ? "Add Slider" : "Edit Slider"}
          </h2>
          <button 
            onClick={onClose} 
            className={styles.closeButton}
            disabled={isLoading}
          >
            ×
          </button>
        </div>

        <div className={styles.breadcrumb}>
          <span className={styles.breadcrumbLink}>Admin</span>
          <span> / </span>
          <span className={styles.breadcrumbLink}>slider</span>
          <span> / </span>
          <span className={styles.breadcrumbCurrent}>
            {mode === "ADD" ? "Add slider" : "Edit slider"}
          </span>
        </div>

        <form className={styles.formGrid} onSubmit={handleSubmit(onSubmit as any)}>
          

          <div>
            <Input
              label="Title"
              name="title"
              type="text"
              register={register}
              errors={errors}
              required
              placeholder="Enter title"
            />
          </div>

          <div>
            <Input
              label="Description"
              name="description"
              type="text"
              register={register}
              errors={errors}
              placeholder="Enter description"
            />
          </div>



          <div>
            <Input
              label="Image"
              name="image"
              type="file"
              register={register}
              errors={errors}
              setValue={setValue}
              required
            />
          </div>



          <div className={styles.fullSpan}>
            <div className={styles.formActions}>
              <Button
                type="button"
                onClick={onClose}
                buttonType="secondary"
                title="Cancel"
                disabled={isLoading}
              />
              <Button
                type="submit"
                buttonType="primary"
                title={mode === "ADD" ? "Add Slider" : "Update Slider"}
                isLoading={isLoading}
              />
            </div>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

export default AddSlider;