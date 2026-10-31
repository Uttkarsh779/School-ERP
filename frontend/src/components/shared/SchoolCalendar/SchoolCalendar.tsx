import { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { Button, Card, ConfirmDialog, Icon, Input, Modal, PageHeader, Select, Spinner } from "../../ui";
import {
  useCopyCalendarMutation,
  useDeleteCalendarEventMutation,
  useGetCalendarQuery,
  useSaveCalendarEventMutation,
  useUpdateCalendarSettingsMutation,
  type CalendarAudience,
  type CalendarEvent,
  type CalendarEventInput,
} from "../../../store/api/calendar.api";
import { useGetSessionsQuery } from "../../../store/api/sessions.api";
import { AUDIENCE_LABEL, dayOffReason, daysIn, entriesOn, fmtRange, isoOf, localToday, weeklyOff } from "./calendarUtils";
import styles from "./SchoolCalendar.module.css";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const errMsg = (e: unknown, fallback: string) => (e as { data?: { message?: string } })?.data?.message ?? fallback;
// Phones show dots in the grid instead of names; tapping a day lists what's on it.
const PHONE = "(max-width: 640px)";
const useIsPhone = () => {
  const [phone, setPhone] = useState(() => typeof window !== "undefined" && window.matchMedia?.(PHONE).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(PHONE);
    if (!mq) return;
    const on = () => setPhone(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return phone;
};
const longDate = (iso: string) =>
  new Date(`${iso}T00:00:00.000Z`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

const addDays = (iso: string, n: number) => new Date(new Date(`${iso}T00:00:00.000Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);

// School calendar: month grid of holidays, events and weekly offs, with this month's list and
// upcoming holidays. Admins add/edit entries, set weekly offs and copy last session's list;
// teachers (who = STAFF) and students (who = STUDENTS) see what applies to them.
const SchoolCalendar = ({ canManage, who }: { canManage: boolean; who: CalendarAudience }) => {
  const now = new Date();
  const [view, setView] = useState({ y: now.getFullYear(), m: now.getMonth() + 1 });
  const today = localToday();
  const monthStart = isoOf(view.y, view.m, 1);
  const daysInMonth = new Date(view.y, view.m, 0).getDate();
  const monthEnd = isoOf(view.y, view.m, daysInMonth);

  const { data, isLoading } = useGetCalendarQuery({ from: monthStart, to: monthEnd });
  const { data: upcomingData } = useGetCalendarQuery({ from: today, to: addDays(today, 180) });
  const settings = data?.settings;
  // Students don't see staff-only entries and vice versa.
  const visible = (list: CalendarEvent[] = []) => list.filter((e) => canManage || e.audience === "ALL" || e.audience === who);
  const events = visible(data?.events);
  const upcoming = visible(upcomingData?.events).filter((e) => e.kind === "HOLIDAY").slice(0, 8);

  const [editing, setEditing] = useState<(CalendarEventInput & { id?: number }) | null>(null);
  const [deleting, setDeleting] = useState<CalendarEvent | null>(null);
  const [copying, setCopying] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const isPhone = useIsPhone();
  const [saveEvent, { isLoading: saving }] = useSaveCalendarEventMutation();
  const [deleteEvent, { isLoading: removing }] = useDeleteCalendarEventMutation();

  const cells = useMemo(() => {
    const lead = (new Date(view.y, view.m - 1, 1).getDay() + 6) % 7;
    return [...Array.from({ length: lead }, () => null), ...Array.from({ length: daysInMonth }, (_, i) => isoOf(view.y, view.m, i + 1))];
  }, [view, daysInMonth]);

  const workingDays = cells.filter((iso) => iso && !dayOffReason(events, settings, iso, who)).length;
  const move = (delta: number) => {
    setSelected(null);
    setView((v) => {
      const d = new Date(v.y, v.m - 1 + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() + 1 };
    });
  };
  // Desktop admins open the entry straight away; on phones (and for viewers) a tap shows the day.
  const onDayClick = (iso: string, list: CalendarEvent[]) => {
    if (canManage && !isPhone) return list[0] ? openEdit(list[0]) : openNew(iso);
    setSelected((s) => (s === iso ? null : iso));
  };
  const selectedList = selected ? entriesOn(events, selected) : [];
  const selectedOff = selected ? dayOffReason(events, settings, selected, who) : null;

  const openNew = (iso?: string) =>
    setEditing({ title: "", kind: "HOLIDAY", audience: "ALL", startDate: iso ?? today, endDate: iso ?? today, description: "" });
  const openEdit = (e: CalendarEvent) =>
    setEditing({ id: e.id, title: e.title, kind: e.kind, audience: e.audience, startDate: e.startDate.slice(0, 10), endDate: e.endDate.slice(0, 10), description: e.description ?? "" });

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!editing) return;
    if (editing.endDate < editing.startDate) return toast.error("End date can't be before the start date");
    try {
      await saveEvent(editing).unwrap();
      toast.success(editing.id ? "Calendar updated" : editing.kind === "HOLIDAY" && editing.endDate >= today ? "Holiday added — everyone gets one summary when you finish" : "Added to the calendar");
      setEditing(null);
    } catch (e) {
      toast.error(errMsg(e, "Couldn't save"));
    }
  };

  const entryLabel = (e: CalendarEvent) => (
    <>
      {e.title}
      {canManage && e.audience !== "ALL" && <span className={styles.aud}> · {AUDIENCE_LABEL[e.audience]}</span>}
    </>
  );

  return (
    <div>
      <PageHeader
        title="School Calendar"
        subtitle={canManage ? "Holidays, events and weekly offs — everyone sees this calendar" : "Holidays and school events"}
        actions={
          canManage ? (
            <div className={styles.headActions}>
              <Button variant="outline" onClick={() => setCopying(true)}>
                Copy from last session
              </Button>
              <Button icon={<Icon name="plus" size={16} />} onClick={() => openNew()}>
                Add holiday / event
              </Button>
            </div>
          ) : undefined
        }
      />

      <div className={styles.layout}>
        <Card padded={false} className={styles.calCard}>
          <header className={styles.calHead}>
            <button type="button" className={styles.navBtn} onClick={() => move(-1)} aria-label="Previous month">
              ‹
            </button>
            <div className={styles.calTitle}>
              <strong>
                {MONTHS[view.m - 1]} {view.y}
              </strong>
              <span>{workingDays} working days</span>
            </div>
            <button type="button" className={styles.navBtn} onClick={() => move(1)} aria-label="Next month">
              ›
            </button>
          </header>
          {isLoading ? (
            <Spinner />
          ) : (
            <div className={styles.grid}>
              {WEEKDAYS.map((d) => (
                <div key={d} className={styles.weekday}>
                  {d}
                </div>
              ))}
              {cells.map((iso, i) => {
                if (!iso) return <div key={`b${i}`} />;
                const list = entriesOn(events, iso);
                const holiday = list.find((e) => e.kind === "HOLIDAY");
                const off = !holiday && weeklyOff(iso, settings);
                return (
                  <div
                    key={iso}
                    className={`${styles.day} ${holiday ? styles.holiday : off ? styles.off : ""} ${iso === today ? styles.today : ""} ${styles.clickable} ${selected === iso ? styles.selected : ""}`}
                    onClick={() => onDayClick(iso, list)}
                    title={[...list.map((e) => e.title), off || ""].filter(Boolean).join(" · ") || undefined}
                  >
                    <span className={styles.num}>{Number(iso.slice(8))}</span>
                    {list.slice(0, 2).map((e) => (
                      <span key={e.id} className={`${styles.chip} ${e.kind === "HOLIDAY" ? styles.chipHoliday : styles.chipEvent}`}>
                        {e.title}
                      </span>
                    ))}
                    {list.length > 2 && <span className={styles.more}>+{list.length - 2}</span>}
                    {off && !list.length && <span className={styles.offLabel}>Off</span>}
                    {list.length > 0 && (
                      <span className={styles.dots} aria-hidden="true">
                        {list.slice(0, 3).map((e) => (
                          <i key={e.id} className={e.kind === "HOLIDAY" ? styles.dotHoliday : styles.dotEvent} />
                        ))}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {selected && (
            <div className={styles.dayPanel}>
              <div className={styles.dayPanelHead}>
                <strong>{longDate(selected)}</strong>
                {canManage && (
                  <Button size="sm" variant="outline" icon={<Icon name="plus" size={14} />} onClick={() => openNew(selected)}>
                    Add
                  </Button>
                )}
              </div>
              {selectedList.length === 0 ? (
                <p className={styles.muted}>{selectedOff ? `${selectedOff} — school closed.` : "Working day — nothing scheduled."}</p>
              ) : (
                <ul className={styles.list}>
                  {selectedList.map((e) => (
                    <li key={e.id} className={styles.item}>
                      <span className={`${styles.dot} ${e.kind === "HOLIDAY" ? styles.dotHoliday : styles.dotEvent}`} />
                      <div className={styles.itemMain}>
                        <div className={styles.itemTitle}>{entryLabel(e)}</div>
                        <div className={styles.muted}>
                          {e.kind === "HOLIDAY" ? "Holiday" : "Event"} · {fmtRange(e)}
                          {e.description ? ` · ${e.description}` : ""}
                        </div>
                      </div>
                      {canManage && (
                        <Button size="sm" variant="ghost" onClick={() => openEdit(e)}>
                          Edit
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div className={styles.legend}>
            <span>
              <i className={styles.lgHoliday} /> Holiday
            </span>
            <span>
              <i className={styles.lgEvent} /> Event
            </span>
            <span>
              <i className={styles.lgOff} /> Weekly off
            </span>
          </div>
        </Card>

        <div className={styles.side}>
          <Card title={`${MONTHS[view.m - 1]} at a glance`}>
            {events.length === 0 ? (
              <p className={styles.muted}>No holidays or events this month.</p>
            ) : (
              <ul className={styles.list}>
                {events.map((e) => (
                  <li key={e.id} className={styles.item}>
                    <span className={`${styles.dot} ${e.kind === "HOLIDAY" ? styles.dotHoliday : styles.dotEvent}`} />
                    <div className={styles.itemMain}>
                      <div className={styles.itemTitle}>{entryLabel(e)}</div>
                      <div className={styles.muted}>
                        {fmtRange(e)}
                        {daysIn(e) > 1 ? ` · ${daysIn(e)} days` : ""}
                        {e.description ? ` · ${e.description}` : ""}
                      </div>
                    </div>
                    {canManage && (
                      <div className={styles.itemActions}>
                        <Button size="sm" variant="ghost" onClick={() => openEdit(e)}>
                          Edit
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setDeleting(e)}>
                          Delete
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Upcoming holidays">
            {upcoming.length === 0 ? (
              <p className={styles.muted}>No holidays in the next six months.</p>
            ) : (
              <ul className={styles.list}>
                {upcoming.map((e) => (
                  <li key={e.id} className={styles.item}>
                    <span className={`${styles.dot} ${styles.dotHoliday}`} />
                    <div className={styles.itemMain}>
                      <div className={styles.itemTitle}>{entryLabel(e)}</div>
                      <div className={styles.muted}>
                        {fmtRange(e)}
                        {daysIn(e) > 1 ? ` · ${daysIn(e)} days` : ""}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {canManage && settings && <WeeklyOffCard sundayOff={settings.sundayOff} offSaturdays={settings.offSaturdays} />}
        </div>
      </div>

      {editing && (
        <Modal title={editing.id ? "Edit calendar entry" : "Add to calendar"} onClose={() => setEditing(null)}>
          <form onSubmit={submit}>
            <div className={styles.form}>
              <div className={styles.wide}>
                <Input label="Title" required maxLength={100} value={editing.title} placeholder="e.g. Diwali break, Annual Day" onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
              </div>
              <Select
                label="Type"
                value={editing.kind}
                onChange={(e) => setEditing({ ...editing, kind: e.target.value as CalendarEvent["kind"] })}
                options={[
                  { label: "Holiday — school closed", value: "HOLIDAY" },
                  { label: "Event — school open", value: "EVENT" },
                ]}
              />
              <Select
                label="Applies to"
                value={editing.audience}
                onChange={(e) => setEditing({ ...editing, audience: e.target.value as CalendarAudience })}
                options={(Object.keys(AUDIENCE_LABEL) as CalendarAudience[]).map((a) => ({ label: AUDIENCE_LABEL[a], value: a }))}
              />
              <Input
                label="From"
                type="date"
                required
                value={editing.startDate}
                onChange={(e) => setEditing({ ...editing, startDate: e.target.value, endDate: editing.endDate < e.target.value ? e.target.value : editing.endDate })}
              />
              <Input label="To" type="date" required min={editing.startDate} value={editing.endDate} onChange={(e) => setEditing({ ...editing, endDate: e.target.value })} />
              <div className={styles.wide}>
                <Input label="Note (optional)" maxLength={500} value={editing.description ?? ""} placeholder="e.g. School reopens on 4 Nov" onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
              </div>
            </div>
            {editing.kind === "HOLIDAY" && editing.endDate >= today && (
              <p className={styles.muted}>
                No need to hurry: holidays you add are announced together in one notification about 10 minutes after you finish, and everyone gets a
                reminder the day before each holiday.
              </p>
            )}
            <div className={styles.actions}>
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" isLoading={saving}>
                {editing.id ? "Save changes" : "Add"}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {deleting && (
        <ConfirmDialog
          title="Remove from calendar?"
          message={`"${deleting.title}" (${fmtRange(deleting)}) will be removed.${deleting.kind === "HOLIDAY" ? " These days become working days again." : ""}`}
          confirmLabel="Remove"
          isLoading={removing}
          onCancel={() => setDeleting(null)}
          onConfirm={async () => {
            try {
              await deleteEvent(deleting.id).unwrap();
              toast.success("Removed from the calendar");
            } catch (e) {
              toast.error(errMsg(e, "Couldn't remove it"));
            } finally {
              setDeleting(null);
            }
          }}
        />
      )}

      {copying && <CopyModal onClose={() => setCopying(false)} />}
    </div>
  );
};

// Weekly offs: Sunday, and which Saturdays of the month.
const WeeklyOffCard = ({ sundayOff, offSaturdays }: { sundayOff: boolean; offSaturdays: number[] }) => {
  const [form, setForm] = useState({ sundayOff, offSaturdays });
  const [save, { isLoading }] = useUpdateCalendarSettingsMutation();
  const toggleSat = (n: number) =>
    setForm((f) => ({ ...f, offSaturdays: f.offSaturdays.includes(n) ? f.offSaturdays.filter((x) => x !== n) : [...f.offSaturdays, n].sort() }));
  const dirty = form.sundayOff !== sundayOff || form.offSaturdays.join() !== offSaturdays.join();

  return (
    <Card title="Weekly offs" subtitle="Days the school is closed every week">
      <label className={styles.check}>
        <input type="checkbox" checked={form.sundayOff} onChange={(e) => setForm({ ...form, sundayOff: e.target.checked })} /> Sunday
      </label>
      <div className={styles.satLabel}>Saturdays off</div>
      <div className={styles.sats}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" className={`${styles.sat} ${form.offSaturdays.includes(n) ? styles.satOn : ""}`} onClick={() => toggleSat(n)} aria-pressed={form.offSaturdays.includes(n)}>
            {["", "1st", "2nd", "3rd", "4th", "5th"][n]}
          </button>
        ))}
      </div>
      <p className={styles.muted}>
        {form.offSaturdays.length === 0 ? "All Saturdays are working days." : form.offSaturdays.length === 5 ? "Every Saturday is off." : `Off on the ${form.offSaturdays.map((n) => ["", "1st", "2nd", "3rd", "4th", "5th"][n]).join(" and ")} Saturday of each month.`}
      </p>
      <div className={styles.actions}>
        <Button
          size="sm"
          disabled={!dirty}
          isLoading={isLoading}
          onClick={async () => {
            try {
              await save(form).unwrap();
              toast.success("Weekly offs saved");
            } catch (e) {
              toast.error(errMsg(e, "Couldn't save"));
            }
          }}
        >
          Save
        </Button>
      </div>
    </Card>
  );
};

// Copy last session's holidays and events a year ahead, to adjust afterwards.
const CopyModal = ({ onClose }: { onClose: () => void }) => {
  const { data: sessions = [] } = useGetSessionsQuery();
  const ordered = [...sessions].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const current = ordered.find((s) => s.isCurrent) ?? ordered[ordered.length - 1];
  const prev = current ? ordered[ordered.indexOf(current) - 1] : undefined;
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [copy, { isLoading }] = useCopyCalendarMutation();
  const from = fromId || (prev ? String(prev.id) : "");
  const to = toId || (current ? String(current.id) : "");
  const options = ordered.map((s) => ({ label: `${s.name}${s.isCurrent ? " (current)" : ""}`, value: String(s.id) }));

  return (
    <Modal title="Copy holidays from another session" onClose={onClose}>
      <p className={styles.muted}>
        Copies every holiday and event to the same dates in the new session. Festival dates change every year, so check and adjust them afterwards. Entries
        already in the new session are skipped.
      </p>
      <div className={styles.form}>
        <Select label="Copy from" value={from} onChange={(e) => setFromId(e.target.value)} options={[{ label: "Choose…", value: "" }, ...options]} />
        <Select label="Into" value={to} onChange={(e) => setToId(e.target.value)} options={[{ label: "Choose…", value: "" }, ...options]} />
      </div>
      <div className={styles.actions}>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          isLoading={isLoading}
          disabled={!from || !to || from === to}
          onClick={async () => {
            try {
              const r = await copy({ fromSessionId: Number(from), toSessionId: Number(to) }).unwrap();
              toast.success(`${r.copied} entr${r.copied === 1 ? "y" : "ies"} copied${r.skipped ? ` · ${r.skipped} already there` : ""} — please check the dates`);
              onClose();
            } catch (e) {
              toast.error(errMsg(e, "Couldn't copy"));
            }
          }}
        >
          Copy
        </Button>
      </div>
    </Modal>
  );
};

export default SchoolCalendar;
