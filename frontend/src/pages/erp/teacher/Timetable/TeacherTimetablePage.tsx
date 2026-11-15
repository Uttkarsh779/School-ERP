import { useEffect } from "react";
import { toast } from "react-toastify";
import { Button, EmptyState, Icon, PageHeader, Spinner } from "../../../../components/ui";
import { printTimetables } from "../../../../components/shared/Print/timetablePrint";
import { useGetPublicWebsiteDataQuery } from "../../../../store/api/cms.api";
import { useAppSelector } from "../../../../store/store";
import TimetableGrid from "../../../../components/shared/TimetableGrid/TimetableGrid";
import { useGetMyTimetableQuery } from "../../../../store/api/timetable.api";

const TeacherTimetablePage = () => {
  const { data: slots, isLoading, isError } = useGetMyTimetableQuery();
  const { data: site } = useGetPublicWebsiteDataQuery();
  const myName = useAppSelector((s) => s.auth.user?.name);

  useEffect(() => {
    if (isError) toast.error("Failed to load your timetable.");
  }, [isError]);

  return (
    <div>
      <PageHeader
        title="My Timetable"
        subtitle="Your weekly teaching schedule across all classes"
        actions={
          slots && slots.length > 0 ? (
            <Button
              variant="outline"
              icon={<Icon name="printer" size={16} />}
              onClick={() => printTimetables([{ title: myName || "My timetable", subtitle: "Teacher's timetable", kind: "teacher", slots }], { school: site?.settings })}
            >
              Print / PDF
            </Button>
          ) : undefined
        }
      />
      {isLoading ? (
        <Spinner />
      ) : !slots || slots.length === 0 ? (
        <EmptyState title="No periods assigned yet" description="Your schedule will appear here once the admin sets it up." />
      ) : (
        <TimetableGrid slots={slots} showClassName />
      )}
    </div>
  );
};

export default TeacherTimetablePage;
