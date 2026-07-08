import { NavLink, Route, Routes, Navigate, useLocation } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import {
  LayoutDashboard,
  Clock,
  ClipboardCheck,
  GraduationCap,
  Wrench,
  PhoneCall,
  Settings as SettingsIcon,
  Users as UsersIcon,
  ShieldCheck,
  LogOut,
  Moon,
  Sun,
  PanelLeftClose,
  PanelLeftOpen,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from './AuthContext';
import { api, type Role } from './api';
import { canAccessSection, sectionKeyForPath } from './perms';
import type { NavSection } from './types';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { TimeUtilization } from './pages/TimeUtilization';
import { KTTracker } from './pages/KTTracker';
import { Maintenance } from './pages/Maintenance';
import { CallQA } from './pages/CallQA';
import { CaseQA } from './pages/CaseQA';
import { Settings } from './pages/Settings';
import { Users } from './pages/Users';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

/** Maps a stored icon name to a Lucide component (fallback: dashboard icon). */
const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard,
  Clock,
  ClipboardCheck,
  GraduationCap,
  Wrench,
  PhoneCall,
  Settings: SettingsIcon,
  Users: UsersIcon,
};

/** Fallback nav used until sections load (matches the seeded default order). */
const fallbackNav: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/time-utilization', label: 'Time Utilization', icon: Clock },
  { to: '/call-qa', label: 'Call QA', icon: PhoneCall },
  { to: '/case-qa', label: 'Case QA', icon: ClipboardCheck },
  { to: '/kt', label: 'KT OPS', icon: GraduationCap },
  { to: '/maintenance', label: 'Maintenance', icon: Wrench },
];

const adminNav: NavItem[] = [
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
  { to: '/users', label: 'Users', icon: UsersIcon },
];

function initials(email: string): string {
  const name = email.split('@')[0] ?? '';
  const parts = name.split(/[._-]/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? parts[0]?.[1] ?? '')).toUpperCase() || 'U';
}

/** Guards a route: renders children only if the role may access `section`, else redirects home. */
function Guard({ role, section, children }: { role: Role; section: string; children: React.ReactNode }) {
  return canAccessSection(role, section) ? <>{children}</> : <Navigate to="/" replace />;
}

export function App() {
  const { user, loading, logout } = useAuth();
  const location = useLocation();
  const [theme, setTheme] = useState<'light' | 'dark'>(
    () => (document.documentElement.dataset.theme as 'light' | 'dark') || (localStorage.getItem('qa-theme') as 'light' | 'dark') || 'light'
  );
  const [sections, setSections] = useState<NavSection[]>([]);
  const [collapsed, setCollapsed] = useState<boolean>(() => localStorage.getItem('qa-sidebar') === 'collapsed');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('qa-theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('qa-sidebar', collapsed ? 'collapsed' : 'open');
  }, [collapsed]);

  useEffect(() => {
    if (!user) return;
    api.get<NavSection[]>('/sections').then((r) => setSections(r.data)).catch(() => {});
  }, [user]);

  const role = (user?.role ?? 'Team Member') as Role;
  const isAdmin = role === 'Admin';

  const nav: NavItem[] = useMemo(() => {
    if (sections.length > 0) {
      return sections
        .filter((s) => s.enabled && (!s.adminOnly || isAdmin))
        .map((s) => ({ to: s.path, label: s.label, icon: ICONS[s.icon] ?? LayoutDashboard, end: s.path === '/' }));
    }
    const base = fallbackNav.filter((n) => canAccessSection(role, sectionKeyForPath(n.to)));
    return isAdmin ? [...base, ...adminNav] : base;
  }, [sections, isAdmin, role]);

  if (loading) {
    return (
      <div className="app">
        <main className="main">
          <p className="muted">Loading…</p>
        </main>
      </div>
    );
  }

  if (!user) return <Login />;

  const activeLabel =
    nav.find((n) => (n.end ? location.pathname === n.to : location.pathname.startsWith(n.to)))?.label ?? 'Dashboard';

  return (
    <div className={`app${collapsed ? ' collapsed' : ''}`}>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-logo">
            <ShieldCheck size={20} />
          </span>
          <span className="brand-name">
            QA Suite<span>Quality Ops</span>
          </span>
        </div>
        <nav className="nav">
          {nav.map((n) => {
            const Icon = n.icon;
            return (
              <NavLink key={n.to} to={n.to} end={n.end} title={n.label} className={({ isActive }) => (isActive ? 'active' : '')}>
                <span className="nav-ico">
                  <Icon size={18} />
                </span>
                <span className="nav-label">{n.label}</span>
              </NavLink>
            );
          })}
        </nav>
        <div className="spacer" />
        <div className="user-card">
          <span className="avatar">{initials(user.email)}</span>
          <div className="user-meta">
            <div className="user-email">{user.email}</div>
            <div className="user-role">{user.role}</div>
          </div>
          <button className="icon-btn" onClick={logout} title="Log out" aria-label="Log out">
            <LogOut size={16} />
          </button>
        </div>
      </aside>
      <div className="content">
        <header className="topbar">
          <button
            className="icon-btn ghost"
            onClick={() => setCollapsed((c) => !c)}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label="Toggle sidebar"
          >
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
          <div className="topbar-title">
            <h1>{activeLabel}</h1>
          </div>
          <div className="topbar-right">
            <span className="role-pill" title="Your role">
              {user.role}
            </span>
            <button
              className="icon-btn ghost"
              onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </button>
          </div>
        </header>
        <main className="main">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route
              path="/time-utilization"
              element={
                <Guard role={role} section="time-utilization">
                  <TimeUtilization />
                </Guard>
              }
            />
            <Route
              path="/kt"
              element={
                <Guard role={role} section="kt">
                  <KTTracker />
                </Guard>
              }
            />
            <Route
              path="/maintenance"
              element={
                <Guard role={role} section="maintenance">
                  <Maintenance />
                </Guard>
              }
            />
            <Route
              path="/call-qa"
              element={
                <Guard role={role} section="call-qa">
                  <CallQA />
                </Guard>
              }
            />
            <Route
              path="/case-qa"
              element={
                <Guard role={role} section="case-qa">
                  <CaseQA />
                </Guard>
              }
            />
            <Route
              path="/settings"
              element={
                <Guard role={role} section="settings">
                  <Settings />
                </Guard>
              }
            />
            <Route
              path="/users"
              element={
                <Guard role={role} section="users">
                  <Users />
                </Guard>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
