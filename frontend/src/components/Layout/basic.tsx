import { Navigate, Outlet } from "react-router-dom";
import { useAppSelector } from "../../store/store";

const roleHome: Record<string, string> = {
  SUPER_ADMIN: "/admin",
  ADMIN: "/admin",
  TEACHER: "/teacher",
  STUDENT: "/student",
};

const Basic = () => {
  const { isAuthenticated, user } = useAppSelector((state) => state.auth);

  if (isAuthenticated) {
    return <Navigate to={roleHome[user?.role ?? ""] ?? "/admin"} replace />;
  }
  return (
    <div>
      <Outlet />
    </div>
  );
};

export default Basic;
