import { useEffect } from "react";
import { toast } from "react-toastify";
import { EmptyState, PageHeader, Spinner } from "../../../../components/ui";
import TimetableGrid from "../../../../components/shared/TimetableGrid/TimetableGrid";
import { useGetMyStudentProfileQuery } from "../../../../store/api/students.api";
import { useGetClassTimetableQuery } from "../../../../store/api/timetable.api";

const StudentTimetablePage = () => {
  const { data: profile, isLoading: profileLoading, isError: profileError } = useGetMyStudentProfileQuery();
  const {
    data: slots,
    isLoading: slotsLoading,
    isError: slotsError,
  } = useGetClassTimetableQuery({ classSectionId: profile?.classSectionId ?? 0 }, { skip: !profile });

  useEffect(() => {
    if (profileError) toast.error("Failed to load your profile.");
    if (slotsError) toast.error("Failed to load your timetable.");
  }, [profileError, slotsError]);

  const subtitle = profile?.classSection ? `${profile.classSection.className} - ${profile.classSection.section}` : undefined;

  return (
    <div>
      <PageHeader title="Timetable" subtitle={subtitle} />
      {profileLoading || slotsLoading ? (
        <Spinner />
      ) : !slots || slots.length === 0 ? (
        <EmptyState title="No timetable published yet" description="Your class schedule will appear here once set up." />
      ) : (
        <TimetableGrid slots={slots} />
      )}
    </div>
  );
};

export default StudentTimetablePage;
