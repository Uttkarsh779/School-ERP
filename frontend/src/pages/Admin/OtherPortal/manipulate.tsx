
import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { motion } from 'framer-motion';
import styles from './otherpage.module.css';
import Button from '../../../components/Button';
import Input from '../../../components/Input';


// Validation schema
const schema = yup.object().shape({
  title: yup.string().required('Title is required'),
  url: yup.string(),
  image: yup
    .mixed<File>()
    .test("fileExists", "Image is required ", function(value) {
      const { parent } = this;
     
      if (parent.mode === "EDIT" && !value) {
        return true;
      }
     
      return value instanceof File;
    }),
});

interface FormData {
  title: string;
  url: string;
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

const AddOtherPortal: React.FC<AddSliderMenuProps> = ({ 
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
      url: '',
      image: undefined as unknown as File,
      ...defaultValues,
    },
  });

  useEffect(() => {
    if (isOpen) {
      reset({
        title: '',
        url: '',
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
      formData.append('url', data.url);
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
        formData.append('url', data.url);
        formData.append('image', data.image);
        onSubmitHandler(formData as any);
      } else {
        // If no new image, send JSON data
        const updateData = {
          title: data.title,
          url: data.url,
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
            {mode === "ADD" ? "Add Other-portal" : "Edit Other-portal"}
          </h2>
          <button 
            onClick={onClose} 
            className={styles.closeButton}
            disabled={isLoading}
          >
            ×
          </button>
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
              label="URL"
              name="url"
              type="text"
              register={register}
              errors={errors}
              placeholder="Enter url"
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
                title={mode === "ADD" ? "Add Other-portal" : "Update Other-portal"}
                isLoading={isLoading}
              />
            </div>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

export default AddOtherPortal;




