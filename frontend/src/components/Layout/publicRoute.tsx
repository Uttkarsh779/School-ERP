import React, { type ReactElement } from "react";

interface PublicRouteProps {
  children: ReactElement;
}

const PublicRoute: React.FC<PublicRouteProps> = ({ children }) => {
  return children;
};

export default PublicRoute;
