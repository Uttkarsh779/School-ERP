import { useState } from "react";
import { toast } from "react-toastify";
import { Badge, Button, Card, Input, Modal, Table } from "../../ui";
import type { TableColumn } from "../../ui";
import {
  useApplyLeaveMutation,
  useCancelLeaveMutation,
  useDecideLeaveMutation,
  type LeaveRequest,
  type LeaveStatus,
} from "../../../store/api/leaves.api";

// Shared leave UI: apply form, requests table (own / to decide), decision dialog.

const errorOf = (err: unknown, fallback: string) => (err as { data?: { message?: string } })?.data?.message ?? fallback;
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

const STATUS_META: Record<LeaveStatus, { label: string; tone: "warning" | "success" | "danger" | "neutral" }> = {
  PENDING: { label: "Pending", tone: "warning" },
  APPROVED: { label: "Approved", tone: "success" },
  REJECTED: { label: "Rejected", tone: "danger" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
};

const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const ApplyLeaveCard = ({ who, hint }: { who: string; hint?: string }) => {
  const [form, setForm] = useState({ fromDate: todayLocal(), toDate: todayLocal(), reason: "" });
  const [apply, { isLoading }] = useApplyLeaveMutation();

  const days =
    form.fromDate && form.toDate && form.toDate >= form.fromDate
      ? Math.round((new Date(form.toDate).getTime() - new Date(form.fromDate).getTime()) / 86_400_000) + 1
      : 0;

  const submit = async () => {
    if (!days) return toast.error("Check the dates — the end date can't be before the start date");
    if (form.reason.trim().length < 5) return toast.error("Please give a reason (at least 5 characters)");
    try {
      await apply({ ...form, reason: form.reason.trim() }).unwrap();
      toast.success("Leave request sent");
      setForm({ fromDate: todayLocal(), toDate: todayLocal(), reason: "" });
    } catch (e) {
      toast.error(errorOf(e, "Couldn't send the request"));
    }
  };

  return (
    <Card title={`Apply for leave · ${who}`} subtitle={hint}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: "1rem", alignItems: "end" }}>
        <Input label="From" type="date" value={form.fromDate} onChange={(e) => setForm({ ...form, fromDate: e.target.value })} />
        <Input label="To" type="date" value={form.toDate} min={form.fromDate} onChange={(e) => setForm({ ...form, toDate: e.target.value })} />
        <div style={{ gridColumn: "1 / -1" }}>
          <Input label="Reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="e.g. Fever — doctor advised rest" />
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "1rem", gap: "1rem", flexWrap: "wrap" }}>
        <span style={{ fontSize: "0.84rem", color: "var(--erp-text-muted)" }}>{days ? `${days} day${days === 1 ? "" : "s"}` : ""}</span>
        <Button onClick={submit} isLoading={isLoading}>
          Send request
        </Button>
      </div>
    </Card>
  );
};

interface LeaveTableProps {
  rows: LeaveRequest[];
  mode: "mine" | "decide";
  showPerson?: boolean;
  emptyMessage?: string;
}

export const LeaveTable = ({ rows, mode, showPerson, emptyMessage = "No leave requests." }: LeaveTableProps) => {
  const [cancel, { isLoading: cancelling }] = useCancelLeaveMutation();
  const [deciding, setDeciding] = useState<{ leave: LeaveRequest; approve: boolean } | null>(null);

  const columns: TableColumn<LeaveRequest>[] = [
    ...(showPerson
      ? [
          {
            key: "person",
            label: "Who",
            render: (l: LeaveRequest) =>
              l.student ? (
                <div>
                  <strong>{l.student.name}</strong>
                  <div style={{ fontSize: "0.78rem", color: "var(--erp-text-muted)" }}>
                    {l.student.classSection} · Roll {l.student.rollNo}
                  </div>
                </div>
              ) : (
                <div>
                  <strong>{l.staff?.name}</strong>
                  <div style={{ fontSize: "0.78rem", color: "var(--erp-text-muted)" }}>Staff</div>
                </div>
              ),
          },
        ]
      : []),
    {
      key: "dates",
      label: "Dates",
      render: (l) => (
        <div>
          {fmtDay(l.fromDate)}
          {l.toDate !== l.fromDate && ` – ${fmtDay(l.toDate)}`}
          <div style={{ fontSize: "0.78rem", color: "var(--erp-text-muted)" }}>
            {l.days} day{l.days === 1 ? "" : "s"}
          </div>
        </div>
      ),
    },
    { key: "reason", label: "Reason" },
    {
      key: "status",
      label: "Status",
      render: (l) => (
        <div>
          <Badge tone={STATUS_META[l.status].tone}>{STATUS_META[l.status].label}</Badge>
          {l.decidedBy && (
            <div style={{ fontSize: "0.76rem", color: "var(--erp-text-muted)" }}>
              by {l.decidedBy}
              {l.decisionNote ? ` — “${l.decisionNote}”` : ""}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "actions",
      label: "",
      render: (l) =>
        l.status !== "PENDING" ? null : mode === "mine" ? (
          <Button size="sm" variant="ghost" isLoading={cancelling} onClick={async () => {
            try {
              await cancel(l.id).unwrap();
              toast.success("Request cancelled");
            } catch (e) {
              toast.error(errorOf(e, "Couldn't cancel"));
            }
          }}>
            Cancel
          </Button>
        ) : (
          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
            <Button size="sm" onClick={() => setDeciding({ leave: l, approve: true })}>Approve</Button>
            <Button size="sm" variant="ghost" onClick={() => setDeciding({ leave: l, approve: false })}>Reject</Button>
          </div>
        ),
    },
  ];

  return (
    <>
      <Table columns={columns} data={rows} keyField="id" emptyMessage={emptyMessage} />
      {deciding && <DecisionModal leave={deciding.leave} approve={deciding.approve} onClose={() => setDeciding(null)} />}
    </>
  );
};

const DecisionModal = ({ leave, approve, onClose }: { leave: LeaveRequest; approve: boolean; onClose: () => void }) => {
  const [note, setNote] = useState("");
  const [decide, { isLoading }] = useDecideLeaveMutation();
  const who = leave.student?.name ?? leave.staff?.name ?? "this person";

  const submit = async () => {
    try {
      const res = await decide({ id: leave.id, approved: approve, note: note.trim() || undefined }).unwrap();
      toast.success(
        approve
          ? `Leave approved${res.attendanceMarked ? ` · ${res.attendanceMarked} day(s) marked Leave in attendance` : ""}`
          : "Leave rejected"
      );
      onClose();
    } catch (e) {
      toast.error(errorOf(e, "Couldn't save the decision"));
    }
  };

  return (
    <Modal title={approve ? "Approve leave?" : "Reject leave?"} onClose={onClose}>
      <p style={{ margin: "0 0 1rem", fontSize: "0.9rem" }}>
        {who} · {fmtDay(leave.fromDate)}
        {leave.toDate !== leave.fromDate && ` – ${fmtDay(leave.toDate)}`} ({leave.days} day{leave.days === 1 ? "" : "s"})
        <br />
        <span style={{ color: "var(--erp-text-muted)" }}>“{leave.reason}”</span>
      </p>
      {approve && leave.kind === "STUDENT" && (
        <p style={{ margin: "0 0 1rem", fontSize: "0.84rem", color: "var(--erp-text-muted)" }}>
          These days (except Sundays) will be marked <strong>Leave</strong> in attendance, unless the student was marked present.
        </p>
      )}
      <Input label={approve ? "Note (optional)" : "Reason for rejecting (optional)"} value={note} onChange={(e) => setNote(e.target.value)} />
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.6rem", marginTop: "1rem" }}>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button variant={approve ? "primary" : "danger"} onClick={submit} isLoading={isLoading}>
          {approve ? "Approve" : "Reject"}
        </Button>
      </div>
    </Modal>
  );
};
