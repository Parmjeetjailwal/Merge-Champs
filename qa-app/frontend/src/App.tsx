import { NavLink, Route, Routes } from 'react-router-dom';
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
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from './AuthContext';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { TimeUtilization } from './pages/TimeUtilization';
import { QAScores } from './pages/QAScores';
import { KTTracker } from './pages/KTTracker';
import { Maintenance } from './pages/Maintenance';
import { CallQA } from './pages/CallQA';
import { Settings } from './pages/Settings';
import { Users } from './pages/Users';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

const baseNav: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/time-utilization', label: 'Time Utilization', icon: Clock },
  { to: '/qa-scores', label: 'Jira Ticket QA', icon: ClipboardCheck },
  { to: '/kt', label: 'New Joinee KT', icon: GraduationCap },
  { to: '/maintenance', label: 'Maintenance', icon: Wrench },
  { to: '/call-qa', label: 'Call QA', icon: PhoneCall },
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

export function App() {
  const { user, loading, logout } = useAuth();

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

  const isAdmin = user.role === 'Admin';
  const nav = isAdmin ? [...baseNav, ...adminNav] : baseNav;

  return (
    <div className="app">
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
              <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => (isActive ? 'active' : '')}>
                <span className="nav-ico">
                  <Icon size={18} />
                </span>
                {n.label}
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
      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/time-utilization" element={<TimeUtilization />} />
          <Route path="/qa-scores" element={<QAScores />} />
          <Route path="/kt" element={<KTTracker />} />
          <Route path="/maintenance" element={<Maintenance />} />
          <Route path="/call-qa" element={<CallQA />} />
          {isAdmin && <Route path="/settings" element={<Settings />} />}
          {isAdmin && <Route path="/users" element={<Users />} />}
        </Routes>
      </main>
    </div>
  );
}
