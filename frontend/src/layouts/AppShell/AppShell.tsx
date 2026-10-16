import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useDispatch } from "react-redux";
import styles from "./AppShell.module.css";
import { Icon } from "../../components/ui";
import { useAppSelector } from "../../store/store";
import { resetTokens } from "../../store/reducers/authReducer";
import { navByRole, getMobilePrimaryNav } from "./navConfig";
import PWAInstallPrompt from "../../components/PWAInstallPrompt/PWAInstallPrompt";

const roleLabel: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  TEACHER: "Teacher",
  PARENT: "Parent",
  STUDENT: "Student",
};

const AppShell = () => {
  const { user } = useAppSelector((state) => state.auth);
  const dispatch = useDispatch();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const items = navByRole[user?.role ?? ""] ?? [];
  const primaryMobileItems = getMobilePrimaryNav(user?.role ?? "");
  const initials = (user?.name ?? user?.email ?? "?").charAt(0).toUpperCase();

  // Determine active section title for mobile header
  const activeItem = items.find((item) =>
    item.end ? location.pathname === item.path : location.pathname.startsWith(item.path)
  );
  const activeTitle = activeItem?.label ?? "RRS Intl School";

  return (
    <div className={styles.shell}>
      {/* PWA Mobile Prompt Banner */}
      <PWAInstallPrompt />

      {/* Left Slide-In Side Navigation (Desktop & Mobile Drawer) */}
      <aside className={`${styles.sidebar} ${mobileOpen ? styles.sidebarOpen : ""}`}>
        <div className={styles.brand}>
          <div className={styles.crest}>RRS</div>
          <div>
            <div className={styles.brandText}>RRS Intl School</div>
            <div className={styles.brandSub}>School ERP</div>
          </div>
        </div>

        <nav className={styles.nav}>
          {items.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end}
              className={({ isActive }) => `${styles.navLink} ${isActive ? styles.navLinkActive : ""}`}
              onClick={() => setMobileOpen(false)}
            >
              <Icon name={item.icon} size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className={styles.footer}>
          <div className={styles.userCard}>
            <div className={styles.avatar}>{initials}</div>
            <div>
              <div className={styles.userName}>{user?.name ?? user?.email}</div>
              <div className={styles.userRole}>{roleLabel[user?.role ?? ""] ?? user?.role}</div>
            </div>
          </div>
          <button type="button" className={styles.logoutButton} onClick={() => dispatch(resetTokens())}>
            <Icon name="logout" size={16} />
            Sign out
          </button>
        </div>
      </aside>

      {/* Backdrop Overlay when Mobile Side Nav is open */}
      {mobileOpen && (
        <div className={styles.overlayVisible} onClick={() => setMobileOpen(false)} />
      )}

      {/* Main Content Area & Mobile Top Header */}
      <div className={styles.main}>
        {/* Mobile Top App Bar with Left Slide-In Hamburger Trigger */}
        <header className={styles.mobileHeader}>
          <button
            type="button"
            className={styles.menuButton}
            onClick={() => setMobileOpen(true)}
            aria-label="Open side menu"
          >
            <Icon name="menu" size={22} />
          </button>
          <div className={styles.mobileBrand}>
            <div className={styles.mobileCrest}>RRS</div>
            <div className={styles.mobileBrandText}>{activeTitle}</div>
          </div>
          <button
            type="button"
            className={styles.mobileAvatarBtn}
            onClick={() => setMobileOpen(true)}
            aria-label="Open User Menu"
          >
            <div className={styles.avatar}>{initials}</div>
          </button>
        </header>

        {/* Content View Outlet */}
        <main className={styles.content}>
          <Outlet />
        </main>
      </div>

      {/* Mobile Bottom Navigation Dock */}
      <nav className={styles.bottomDock} aria-label="Mobile Navigation">
        {primaryMobileItems.map((item) => {
          const isActive = item.end
            ? location.pathname === item.path
            : location.pathname.startsWith(item.path);

          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end}
              className={`${styles.dockItem} ${isActive ? styles.dockItemActive : ""}`}
              onClick={() => setMobileOpen(false)}
            >
              <div className={styles.dockIconContainer}>
                <Icon name={item.icon} size={20} />
              </div>
              <span className={styles.dockLabel}>{item.label}</span>
            </NavLink>
          );
        })}

        {/* 5th Dock Item: Menu (Opens Left Side Nav) */}
        <button
          type="button"
          className={`${styles.dockItem} ${mobileOpen ? styles.dockItemActive : ""}`}
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Open menu options"
        >
          <div className={styles.dockIconContainer}>
            <Icon name="grid" size={20} />
          </div>
          <span className={styles.dockLabel}>Menu</span>
        </button>
      </nav>
    </div>
  );
};

export default AppShell;
