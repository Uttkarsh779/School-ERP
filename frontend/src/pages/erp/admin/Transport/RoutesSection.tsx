import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "react-toastify";
import { Badge, Button, Card, EmptyState, FormGrid, FormSection, Input, Modal, Spinner, Table } from "../../../../components/ui";
import type { TableColumn } from "../../../../components/ui";
import {
  useCreateTransportRouteMutation,
  useGetTransportRoutesQuery,
  useUpdateTransportRouteMutation,
} from "../../../../store/api/transport.api";
import styles from "./AdminTransportPage.module.css";

interface RouteFormInputs {
  routeName: string;
  stops: string;
}

const getErrorMessage = (err: unknown, fallback: string) => {
  if (err && typeof err === "object" && "data" in err) {
    const data = (err as { data?: { message?: string } }).data;
    if (data?.message) return data.message;
  }
  return fallback;
};

// Routes table + create/edit modal. A route's vehicle count and student count
// come straight off the GET /transport/routes payload (vehicles[] + _count).
const RoutesSection = () => {
  const { data: routes, isLoading, isError } = useGetTransportRoutesQuery();
  const [createTransportRoute, { isLoading: isCreating }] = useCreateTransportRouteMutation();
  const [updateTransportRoute, { isLoading: isUpdating }] = useUpdateTransportRouteMutation();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRoute, setEditingRoute] = useState<ITransportRoute | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<RouteFormInputs>({ defaultValues: { routeName: "", stops: "" } });

  const openCreateModal = () => {
    setEditingRoute(null);
    reset({ routeName: "", stops: "" });
    setIsModalOpen(true);
  };

  const openEditModal = (route: ITransportRoute) => {
    setEditingRoute(route);
    reset({ routeName: route.routeName, stops: route.stops ?? "" });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingRoute(null);
    reset();
  };

  const onSubmit = async (values: RouteFormInputs) => {
    try {
      if (editingRoute) {
        await updateTransportRoute({
          id: editingRoute.id,
          routeName: values.routeName,
          stops: values.stops || null,
        }).unwrap();
        toast.success("Route updated");
      } else {
        await createTransportRoute({ routeName: values.routeName, stops: values.stops || undefined }).unwrap();
        toast.success("Route created");
      }
      closeModal();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to save transport route"));
    }
  };

  const columns: TableColumn<ITransportRoute>[] = [
    { key: "routeName", label: "Route Name" },
    { key: "stops", label: "Stops", render: (route) => route.stops || "—" },
    { key: "vehicles", label: "Vehicles", render: (route) => route.vehicles?.length ?? 0 },
    {
      key: "students",
      label: "Students",
      render: (route) => <Badge tone="info">{route._count?.students ?? 0}</Badge>,
    },
    {
      key: "actions",
      label: "Actions",
      render: (route) => (
        <Button type="button" size="sm" variant="outline" onClick={() => openEditModal(route)}>
          Edit
        </Button>
      ),
    },
  ];

  return (
    <Card
      title="Routes"
      subtitle="Manage the school's transport routes"
      action={
        <Button type="button" onClick={openCreateModal}>
          + New Route
        </Button>
      }
    >
      {isLoading ? (
        <Spinner />
      ) : isError ? (
        <EmptyState title="Couldn't load routes" description="Please try refreshing the page." />
      ) : !routes || routes.length === 0 ? (
        <EmptyState
          title="No transport routes yet"
          description="Create your first route to start assigning vehicles and students."
          action={
            <Button type="button" onClick={openCreateModal}>
              + New Route
            </Button>
          }
        />
      ) : (
        <Table columns={columns} data={routes} keyField="id" />
      )}

      {isModalOpen && (
        <Modal title={editingRoute ? "Edit Route" : "New Route"} onClose={closeModal}>
          <form onSubmit={handleSubmit(onSubmit)}>
            <FormSection title="Route Details">
              <FormGrid>
                <Input
                  label="Route Name"
                  placeholder="e.g. Route 3 - North City"
                  required
                  error={errors.routeName?.message}
                  {...register("routeName", { required: "Route name is required" })}
                />
                <Input
                  label="Stops"
                  placeholder="Comma or line separated, e.g. Gate A, Market Rd, Civil Lines"
                  hint="Free-form list of stops along this route"
                  style={{ gridColumn: "1 / -1" }}
                  {...register("stops")}
                />
              </FormGrid>
            </FormSection>
            <div className={styles.formActions}>
              <Button type="button" variant="ghost" onClick={closeModal}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" isLoading={editingRoute ? isUpdating : isCreating}>
                {editingRoute ? "Save Changes" : "Create Route"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </Card>
  );
};

export default RoutesSection;
