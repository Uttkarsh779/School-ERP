import { useState } from "react";
import { toast } from "react-toastify";
import { Button, Modal, Select } from "../../ui";
import { REQUEST_LABEL, useResolveDataRequestMutation, type DataRequest } from "../../../store/api/privacy.api";

// Office reply to a family's data request. The reply is shown to the family on My Profile.
const ResolveRequestModal = ({ request, onClose }: { request: DataRequest; onClose: () => void }) => {
  const [resolve, { isLoading }] = useResolveDataRequestMutation();
  const [status, setStatus] = useState<"RESOLVED" | "REJECTED">("RESOLVED");
  const [response, setResponse] = useState("");
  const save = async () => {
    try {
      await resolve({ id: request.id, status, response: response.trim() }).unwrap();
      toast.success("Reply saved. The family sees it on My Profile.");
      onClose();
    } catch (e: any) {
      toast.error(e?.data?.message ?? "Couldn't save the reply");
    }
  };
  return (
    <Modal title={`Reply: ${REQUEST_LABEL[request.type]}`} onClose={onClose}>
      <div style={{ display: "grid", gap: "0.9rem" }}>
        <div style={{ background: "var(--erp-bg, #f4f6f9)", borderRadius: 8, padding: "0.6rem 0.75rem", fontSize: "0.9rem" }}>
          {request.student && (
            <div style={{ fontWeight: 600 }}>
              {request.student.name} · {request.student.admissionNo}
            </div>
          )}
          <div>{request.details}</div>
        </div>
        {request.type === "CORRECTION" && (
          <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--erp-text-muted)" }}>Make the correction on the student's profile first, then reply here.</p>
        )}
        {request.type === "WITHDRAW_CONSENT" && (
          <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--erp-text-muted)" }}>
            If you agree, also record the withdrawal on the student's Privacy tab, and tell the family which records the school still has to keep.
          </p>
        )}
        <Select
          label="Outcome"
          value={status}
          onChange={(e) => setStatus(e.target.value as "RESOLVED" | "REJECTED")}
          options={[
            { label: "Done", value: "RESOLVED" },
            { label: "Declined (explain why)", value: "REJECTED" },
          ]}
        />
        <label style={{ display: "grid", gap: 4, fontSize: "0.88rem", fontWeight: 600 }}>
          Reply to the family
          <textarea
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            rows={4}
            maxLength={2000}
            style={{ font: "inherit", fontWeight: 400, padding: "0.55rem 0.7rem", borderRadius: 8, border: "1px solid var(--erp-border, #cfd5dd)", resize: "vertical" }}
          />
        </label>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} isLoading={isLoading} disabled={response.trim().length < 5}>
            Save reply
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default ResolveRequestModal;
