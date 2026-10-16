import { Outlet } from "react-router-dom";
import Sidebar from "../Sidebar/Sidebar";

const Layout = () => {
  return (
    <Sidebar>
      <Outlet />
    </Sidebar>
  );
};

export default Layout;
