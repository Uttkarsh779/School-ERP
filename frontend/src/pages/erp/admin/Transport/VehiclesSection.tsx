import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "react-toastify";
import { Badge, Button, Card, EmptyState, FormGrid, FormSection, Input, Modal, Select, Spinner, Table } from "../../../../components/ui";
import type { SelectOption, TableColumn } from "../../../../components/ui";
import {
  useCreateVehicleMutation,
  useGetTransportRoutesQuery,
  useGetVehiclesQuery,
  useUpdateVehicleMutation,
} from "../../../../store/api/transport.api";
import styles from "./AdminTransportPage.module.css";

interface VehicleFormInputs {
  vehicleNo: string;
  driverName: string;
  driverContact: string;
  ownerName: string;
  ownerContact: string;
  capacity: string;
  routeId: string;
}

const getErrorMessage = (err: unknown, fallback: string) => {
  if (err && typeof err === "object" && "data" in err) {
    const data = (err as { data?: { message?: string } }).data;
    if (data?.message) return data.message;
  }
  return fallback;
};

// Vehicles table (buses/vans) + create/edit modal, with driver name/contact and owner name/contact
const VehiclesSection = () => {
  const { data: vehicles, isLoading, isError } = useGetVehiclesQuery();
  const { data: routes } = useGetTransportRoutesQuery();
  const [createVehicle, { isLoading: isCreating }] = useCreateVehicleMutation();
  const [updateVehicle, { isLoading: isUpdating }] = useUpdateVehicleMutation();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<IVehicle | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<VehicleFormInputs>({
    defaultValues: {
      vehicleNo: "",
      driverName: "",
      driverContact: "",
      ownerName: "",
      ownerContact: "",
      capacity: "",
      routeId: "",
    },
  });

  const routeOptions: SelectOption[] = (routes ?? []).map((route) => ({ label: route.routeName, value: route.id }));

  const openCreateModal = () => {
    setEditingVehicle(null);
    reset({
      vehicleNo: "",
      driverName: "",
      driverContact: "",
      ownerName: "",
      ownerContact: "",
      capacity: "",
      routeId: "",
    });
    setIsModalOpen(true);
  };

  const openEditModal = (vehicle: IVehicle) => {
    setEditingVehicle(vehicle);
    reset({
      vehicleNo: vehicle.vehicleNo,
      driverName: vehicle.driverName ?? "",
      driverContact: vehicle.driverContact ?? "",
      ownerName: vehicle.ownerName ?? "",
      ownerContact: vehicle.ownerContact ?? "",
      capacity: vehicle.capacity != null ? String(vehicle.capacity) : "",
      routeId: vehicle.routeId != null ? String(vehicle.routeId) : "",
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingVehicle(null);
    reset();
  };

  const onSubmit = async (values: VehicleFormInputs) => {
    try {
      if (editingVehicle) {
        await updateVehicle({
          id: editingVehicle.id,
          vehicleNo: values.vehicleNo,
          driverName: values.driverName || null,
          driverContact: values.driverContact || null,
          ownerName: values.ownerName || null,
          ownerContact: values.ownerContact || null,
          capacity: values.capacity ? Number(values.capacity) : null,
          routeId: values.routeId ? Number(values.routeId) : null,
        }).unwrap();
        toast.success("Vehicle updated");
      } else {
        await createVehicle({
          vehicleNo: values.vehicleNo,
          driverName: values.driverName || undefined,
          driverContact: values.driverContact || undefined,
          ownerName: values.ownerName || undefined,
          ownerContact: values.ownerContact || undefined,
          capacity: values.capacity ? Number(values.capacity) : undefined,
          routeId: values.routeId ? Number(values.routeId) : undefined,
        }).unwrap();
        toast.success("Vehicle created");
      }
      closeModal();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to save vehicle"));
    }
  };

  const columns: TableColumn<IVehicle>[] = [
    { key: "vehicleNo", label: "Vehicle No" },
    {
      key: "driver",
      label: "Driver Details",
      render: (vehicle) => (
        <div style={{ display: "flex", flexDirection: "column" }}>
          <strong>{vehicle.driverName || "—"}</strong>
          {vehicle.driverContact && (
            <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>{vehicle.driverContact}</span>
          )}
        </div>
      ),
    },
    {
      key: "owner",
      label: "Owner Details",
      render: (vehicle) => (
        <div style={{ display: "flex", flexDirection: "column" }}>
          <strong>{vehicle.ownerName || "—"}</strong>
          {vehicle.ownerContact && (
            <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>{vehicle.ownerContact}</span>
          )}
        </div>
      ),
    },
    { key: "capacity", label: "Capacity", render: (vehicle) => vehicle.capacity ?? "—" },
    {
      key: "route",
      label: "Route",
      render: (vehicle) => (vehicle.route ? vehicle.route.routeName : <Badge tone="neutral">Unassigned</Badge>),
    },
    {
      key: "actions",
      label: "Actions",
      render: (vehicle) => (
        <Button type="button" size="sm" variant="outline" onClick={() => openEditModal(vehicle)}>
          Edit
        </Button>
      ),
    },
  ];

  return (
    <Card
      title="Vehicles"
      subtitle="Manage buses/vans, drivers, vehicle owners, and route assignments"
      action={
        <Button type="button" onClick={openCreateModal}>
          + New Vehicle
        </Button>
      }
    >
      {isLoading ? (
        <Spinner />
      ) : isError ? (
        <EmptyState title="Couldn't load vehicles" description="Please try refreshing the page." />
      ) : !vehicles || vehicles.length === 0 ? (
        <EmptyState
          title="No vehicles yet"
          description="Add your first vehicle to start assigning it to a route."
          action={
            <Button type="button" onClick={openCreateModal}>
              + New Vehicle
            </Button>
          }
        />
      ) : (
        <Table columns={columns} data={vehicles} keyField="id" />
      )}

      {isModalOpen && (
        <Modal title={editingVehicle ? "Edit Vehicle" : "New Vehicle"} onClose={closeModal}>
          <form onSubmit={handleSubmit(onSubmit)}>
            <FormSection title="Vehicle Details">
              <FormGrid>
                <Input
                  label="Vehicle No"
                  placeholder="e.g. DL-1PC-4521"
                  required
                  error={errors.vehicleNo?.message}
                  {...register("vehicleNo", { required: "Vehicle No is required" })}
                />
                <Input label="Driver Name" placeholder="e.g. Ramesh Kumar" {...register("driverName")} />
                <Input label="Driver Contact" placeholder="e.g. 98765 43210" {...register("driverContact")} />
                <Input label="Owner Name" placeholder="e.g. Acme Transport Services" {...register("ownerName")} />
                <Input label="Owner Contact Number" placeholder="e.g. 98123 45678" {...register("ownerContact")} />
                <Input label="Capacity" type="number" placeholder="e.g. 40" {...register("capacity")} />
                <Select label="Route" placeholder="Unassigned" options={routeOptions} {...register("routeId")} />
              </FormGrid>
            </FormSection>
            <div className={styles.formActions}>
              <Button type="button" variant="ghost" onClick={closeModal}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" isLoading={editingVehicle ? isUpdating : isCreating}>
                {editingVehicle ? "Save Changes" : "Create Vehicle"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </Card>
  );
};

export default VehiclesSection;
