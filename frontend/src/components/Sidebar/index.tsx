import React, { useState, useEffect, type ReactElement } from "react";
import { Link, useLocation } from "react-router-dom";
import styles from "./Sidebar.module.css";
import logo from "../../assets/images/logo.png";
import { useDispatch, useSelector } from "react-redux";
import type { RootState } from "../../store/store";
import { resetTokens } from "../../store/reducers/authReducer";

interface SidebarProps {
  children: ReactElement;
}

const menuItems = {
  ADMIN: [
    { name: "Dashboard", path: "/dashboard" },
    { name: "Students", path: "/register-student" },
    { name: "Companies", path: "/register-company" },
    { name: "Job", path: "/job-list" },
    { name: "Placed Student", path: "/job-list" },
    { name: "Admins", path: "/register-admin" },
  ],
  STUDENT: [
    { name: "Dashboard", path: "/dashboard" },
    { name: "Job", path: "/job-list" },
    { name: "Personal Detail", path: "/personal-detail" },
    { name: "Academic Detail", path: "/academic-detail" },
    { name: "Co-Curricular Activities", path: "/co-curriculum" },
    { name: "Skills & more", path: "/student-activities" },
    { name: "Postion & Responsibilities", path: "/student-responsibilities" },
    { name: "Important Links", path: "/student-links" },
    { name: "Resume", path: "/resume" },
  ],
  COMPANY: [
    { name: "Dashboard", path: "/dashboard" },
    { name: "Job", path: "/job-list" },
    { name: "Company Detail", path: "/company-detail" },
    { name: "HR Detail", path: "/hr-detail" },
  ],
};

const Sidebar: React.FC<SidebarProps> = ({ children }) => {
  const location = useLocation();
  const [isMobile, setIsMobile] = useState<boolean>(window.innerWidth <= 768);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth <= 768;
      setIsMobile(mobile);
      if (!mobile) setIsMobileOpen(false);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const dispatch = useDispatch();
  const toggleSidebar = () => setIsMobileOpen(!isMobileOpen);
  const closeMobile = () => isMobile && setIsMobileOpen(false);
  const logOut = () => {
    dispatch(resetTokens());
    closeMobile();
  };
  const user = useSelector((state: RootState) => state.auth.user) as IUser;

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <div className={styles.leftHeader}>
          {isMobile && (
            <button className={styles.toggleButton} onClick={toggleSidebar}>
              ☰
            </button>
          )}
          <img
            src={logo}
            alt="National Fire Service College"
            className={styles.heroImage}
          />
          {!isMobile && (
            <div>
              <h3>National Fire Service College</h3>
              <p>Placement Portal</p>
            </div>
          )}
        </div>
        <div className={styles.userIcon}>
          <p>{user.email}</p>
          <img
            src={logo}
            alt="National Fire Service College"
            className={styles.heroImage}
          />
        </div>
      </header>
      <div className={styles.container}>
        <aside
          className={`${styles.sidebar} ${
            isMobile
              ? isMobileOpen
                ? styles.mobileVisible
                : styles.mobileHidden
              : ""
          }`}
        >
          {menuItems["ADMIN"].map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`${styles.menuItem} ${
                location.pathname === item.path ? styles.active : ""
              }`}
              onClick={closeMobile}
            >
              {item.name}
            </Link>
          ))}
          <Link to="#" className={styles.menuItem} onClick={logOut}>
            Logout
          </Link>
        </aside>
        <main className={styles.mainContent}>{children}</main>
        {isMobileOpen && isMobile && (
          <div className={styles.overlay} onClick={closeMobile} />
        )}
      </div>
    </div>
  );
};

export default Sidebar;
