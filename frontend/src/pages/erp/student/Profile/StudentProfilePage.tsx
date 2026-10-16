import { useEffect } from "react";
import { toast } from "react-toastify";
import { EmptyState, PageHeader, Spinner } from "../../../../components/ui";
import StudentProfileView from "../../../../components/shared/StudentProfileView/StudentProfileView";
import { useGetMyStudentProfileQuery } from "../../../../store/api/students.api";

const StudentProfilePage = () => {
  const { data: profile, isLoading, isError } = useGetMyStudentProfileQuery();

  useEffect(() => {
    if (isError) toast.error("Failed to load your profile.");
  }, [isError]);

  return (
    <div>
      <PageHeader title="My Profile" subtitle="RRS International School — Student Profile Portal" />
      {isLoading ? (
        <Spinner />
      ) : !profile ? (
        <EmptyState title="Couldn't load your profile" description="Please try refreshing the page." />
      ) : (
        <StudentProfileView student={profile} />
      )}
    </div>
  );
};

export default StudentProfilePage;
