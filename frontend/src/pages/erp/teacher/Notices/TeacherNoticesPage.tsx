import { PageHeader } from "../../../../components/ui";
import NoticeBoard from "../../../../components/shared/NoticeBoard/NoticeBoard";

const TeacherNoticesPage = () => (
  <div>
    <PageHeader title="Notices" subtitle="Announcements from the school" />
    <NoticeBoard />
  </div>
);

export default TeacherNoticesPage;
