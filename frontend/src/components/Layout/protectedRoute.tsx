import React, { type ReactElement } from "react";
import { Navigate } from "react-router-dom";
import { useAppSelector } from "../../store/store";
import { can, type Permission } from "../../store/permissions";

interface ProtectedRouteProps {
  allowedRoles?: string[];
  children: ReactElement;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  allowedRoles,
}) => {
  const { isAuthenticated, user } = useAppSelector((state) => state.auth);

  // Not logged in → redirect to login
  if (!isAuthenticated) {
    return <Navigate to="/admin/login" replace />;
  }

  // Role check: if allowedRoles is specified, user.role must be in the list.
  // A session without a role (stale/partial localStorage) must not slip through.
  if (allowedRoles && allowedRoles.length > 0) {
    if (!user?.role) return <Navigate to="/admin/login" replace />;
    if (!allowedRoles.includes(user.role)) {
      // Logged in but wrong role → redirect to home
      return <Navigate to="/" replace />;
    }
  }

  return children;
};

export default ProtectedRoute;

// Office console page guard: a role without the permission goes back to the dashboard
// (the menu doesn't show the page either; the server refuses the data anyway).
export const RequirePermission = ({ perm, children }: { perm: Permission; children: ReactElement }) =>
  can(useAppSelector((s) => s.auth.user?.role), perm) ? children : <Navigate to="/admin" replace />;
