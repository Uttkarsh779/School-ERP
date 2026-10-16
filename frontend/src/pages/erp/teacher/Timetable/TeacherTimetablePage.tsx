import { useEffect } from "react";
import { toast } from "react-toastify";
import { EmptyState, PageHeader, Spinner } from "../../../../components/ui";
import TimetableGrid from "../../../../components/shared/TimetableGrid/TimetableGrid";
import { useGetMyTimetableQuery } from "../../../../store/api/timetable.api";

const TeacherTimetablePage = () => {
  const { data: slots, isLoading, isError } = useGetMyTimetableQuery();

  useEffect(() => {
    if (isError) toast.error("Failed to load your timetable.");
  }, [isError]);

  return (
    <div>
      <PageHeader title="My Timetable" subtitle="Your weekly teaching schedule across all classes" />
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
