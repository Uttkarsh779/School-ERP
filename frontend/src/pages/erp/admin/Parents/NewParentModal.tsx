import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "react-toastify";
import { Modal, Button, FormGrid, FormSection, Input } from "../../../../components/ui";
import { useCreateParentMutation } from "../../../../store/api/parents.api";
import type { CreateParentInput } from "../../../../store/api/parents.api";
import ChildPicker from "./ChildPicker";
import styles from "./ParentModals.module.css";

interface NewParentFormInputs {
  name: string;
  email?: string;
  contact?: string;
}

interface NewParentModalProps {
  onClose: () => void;
}

interface ApiErrorShape {
  data?: { message?: string };
}

const NewParentModal = ({ onClose }: NewParentModalProps) => {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<NewParentFormInputs>();
  const [studentIds, setStudentIds] = useState<number[]>([]);
  const [createParent, { isLoading }] = useCreateParentMutation();

  const onSubmit = async (values: NewParentFormInputs) => {
    const body: CreateParentInput = {
      name: values.name.trim(),
      email: values.email?.trim() || undefined,
      contact: values.contact?.trim() || undefined,
      studentIds,
    };

    try {
      await createParent(body).unwrap();
      toast.success("Parent record created successfully.");
      reset();
      setStudentIds([]);
      onClose();
    } catch (err) {
      const message = (err as ApiErrorShape)?.data?.message ?? "Failed to create parent.";
      toast.error(message);
    }
  };

  return (
    <Modal title="New Parent" onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <FormSection title="Parent Details">
          <FormGrid>
            <Input
              label="Full name"
              required
              placeholder="e.g. Rajesh Kumar"
              {...register("name", { required: "Name is required" })}
              error={errors.name?.message}
            />
            <Input
              label="Email (Optional)"
              type="email"
              placeholder="e.g. parent@gmail.com"
              {...register("email")}
            />
            <Input
              label="Contact number"
              placeholder="e.g. +91 9876543210"
              {...register("contact")}
            />
          </FormGrid>
        </FormSection>

        <FormSection title={`Link Children (${studentIds.length} selected)`}>
          <ChildPicker selectedIds={studentIds} onChange={setStudentIds} />
        </FormSection>

        <div className={styles.actions}>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isLoading}>
            Create Parent Record
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default NewParentModal;
