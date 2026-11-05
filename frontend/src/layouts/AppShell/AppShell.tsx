import { useEffect, useState, Fragment } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useDispatch } from "react-redux";
import styles from "./AppShell.module.css";
import { Icon } from "../../components/ui";
import { useAppSelector } from "../../store/store";
import { resetTokens } from "../../store/reducers/authReducer";
import { navByRole, getMobilePrimaryNav, profilePathByRole } from "./navConfig";
import { ROLE_LABEL } from "../../store/permissions";
import { useGetMyProfileQuery } from "../../store/api/profile.api";
import PWAInstallPrompt from "../../components/PWAInstallPrompt/PWAInstallPrompt";
import NotificationBell from "../../components/Notifications/NotificationBell";
import EnableNotificationsBanner from "../../components/Notifications/EnableNotificationsBanner";


const AppShell = () => {
  const { user } = useAppSelector((state) => state.auth);
  const dispatch = useDispatch();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Mobile drawer: close on navigation, and keep the page behind it from scrolling.
  useEffect(() => setMobileOpen(false), [location.pathname]);
  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  const items = navByRole[user?.role ?? ""] ?? [];
  const primaryMobileItems = getMobilePrimaryNav(user?.role ?? "");
  // Profile photo + current name (they can change after login) for the user card.
  const { data: me } = useGetMyProfileQuery(undefined, { skip: !user?.role });
  const displayName = me?.name ?? user?.name ?? user?.email;
  const initials = (displayName ?? "?").charAt(0).toUpperCase();
  const avatar = me?.photoUrl ? <img src={me.photoUrl} alt="" className={styles.avatarImg} /> : initials;
  const profilePath = profilePathByRole[user?.role ?? ""];
  // The school name/logo takes you back to your own dashboard (the first nav item).
  const homePath = items[0]?.path ?? "/";

  // Determine active section title for mobile header
  const activeItem = items.find((item) => (item.end ? location.pathname === item.path : location.pathname.startsWith(item.path)));
  const activeTitle = activeItem?.label ?? "RRS Intl School";

  return (
    <div className={styles.shell}>
      {/* PWA Mobile Prompt Banner */}
      <PWAInstallPrompt />

      {/* Left Slide-In Side Navigation (Desktop & Mobile Drawer) */}
      <aside className={`${styles.sidebar} ${mobileOpen ? styles.sidebarOpen : ""}`}>
        <Link to={homePath} className={styles.brand} title="Go to dashboard" onClick={() => setMobileOpen(false)}>
          <div className={styles.crest}>RRS</div>
          <div>
            <div className={styles.brandText}>RRS Intl School</div>
            <div className={styles.brandSub}>School ERP</div>
          </div>
        </Link>

        <nav className={styles.nav}>
          {items.map((item, i) => (
            <Fragment key={item.path}>
              {item.group && item.group !== items[i - 1]?.group && <div className={styles.navGroup}>{item.group}</div>}
              <NavLink
                to={item.path}
                end={item.end}
                className={({ isActive }) => `${styles.navLink} ${isActive ? styles.navLinkActive : ""}`}
                onClick={() => setMobileOpen(false)}
              >
                <Icon name={item.icon} size={18} />
                {item.label}
              </NavLink>
            </Fragment>
          ))}
        </nav>

        <div className={styles.footer}>
          <div className={styles.footerActions}>
            <Link to="/" className={styles.footerLink} title="Open the school website">
              <Icon name="globe" size={18} />
              <span>School website</span>
              <Icon name="externalLink" size={14} className={styles.footerLinkHint} />
            </Link>
            <button type="button" className={`${styles.footerLink} ${styles.footerLinkDanger}`} onClick={() => dispatch(resetTokens())}>
              <Icon name="logout" size={18} />
              <span>Sign out</span>
            </button>
          </div>
          <Link
            to={profilePath ?? "#"}
            className={`${styles.userCard} ${styles.userCardLink}`}
            title="My profile"
            onClick={() => setMobileOpen(false)}
          >
            <div className={styles.avatar}>{avatar}</div>
            <div className={styles.userText}>
              <div className={styles.userName}>{displayName}</div>
              <div className={styles.userRole}>{ROLE_LABEL[user?.role ?? ""] ?? user?.role}</div>
            </div>
            <Icon name="chevronRight" size={16} className={styles.userChevron} />
          </Link>
        </div>
      </aside>

      {/* Backdrop Overlay when Mobile Side Nav is open */}
      {mobileOpen && <div className={styles.overlayVisible} onClick={() => setMobileOpen(false)} />}

      {/* Main Content Area & Mobile Top Header */}
      <div className={styles.main}>
        {/* Mobile Top App Bar with Left Slide-In Hamburger Trigger */}
        <header className={styles.mobileHeader}>
          <button type="button" className={styles.menuButton} onClick={() => setMobileOpen(true)} aria-label="Open side menu">
            <Icon name="menu" size={22} />
          </button>
          <Link to={homePath} className={styles.mobileBrand} aria-label="Go to dashboard">
            <div className={styles.mobileCrest}>RRS</div>
            <div className={styles.mobileBrandText}>{activeTitle}</div>
          </Link>
          <div className={styles.mobileHeaderEnd}>
            <NotificationBell />
            <button type="button" className={styles.mobileAvatarBtn} onClick={() => setMobileOpen(true)} aria-label="Open User Menu">
              <div className={styles.avatar}>{avatar}</div>
            </button>
          </div>
        </header>

        {/* Desktop top bar: notifications */}
        <div className={styles.desktopBar}>
          <NotificationBell />
        </div>

        {/* Content View Outlet */}
        <main className={styles.content}>
          <EnableNotificationsBanner />
          <Outlet />
        </main>
      </div>

      {/* Mobile Bottom Navigation Dock */}
      <nav className={styles.bottomDock} aria-label="Mobile Navigation">
        {primaryMobileItems.map((item) => {
          const isActive = item.end ? location.pathname === item.path : location.pathname.startsWith(item.path);

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
