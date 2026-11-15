import { toast } from "react-toastify";
import { Button, Icon } from "../ui";
import { useDownloadExportMutation, type ExportPath } from "../../store/api/exports.api";

// "Export to Excel": downloads an .xlsx built on the server for the current filters.
const ExportButton = ({
  path,
  params,
  label = "Export to Excel",
  size = "sm",
  variant = "outline",
  disabled,
}: {
  path: ExportPath;
  params?: Record<string, string | number | undefined>;
  label?: string;
  size?: "sm" | "md";
  variant?: "primary" | "outline" | "ghost";
  disabled?: boolean;
}) => {
  const [download, { isLoading }] = useDownloadExportMutation();
  const go = async () => {
    try {
      const r: any = await download({ path, params }).unwrap();
      if (r?.success === false) throw { data: r };
      toast.success(`Downloaded ${r.saved}`);
    } catch (e: any) {
      toast.error(e?.data?.message ?? "Couldn't create the Excel file. Please try again.");
    }
  };
  return (
    <Button type="button" size={size} variant={variant} icon={<Icon name="download" size={15} />} onClick={go} isLoading={isLoading} disabled={disabled}>
      {label}
    </Button>
  );
};

export default ExportButton;
