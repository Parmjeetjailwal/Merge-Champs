import { NavLink, Route, Routes } from 'react-router-dom';
import { ROLES, type Role } from './api';
import { useRole } from './RoleContext';
import { Dashboard } from './pages/Dashboard';
import { TimeUtilization } from './pages/TimeUtilization';
import { QAScores } from './pages/QAScores';
import { KTTracker } from './pages/KTTracker';
import { Maintenance } from './pages/Maintenance';
import { CallQA } from './pages/CallQA';

const nav = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/time-utilization', label: 'Time Utilization' },
  { to: '/qa-scores', label: 'Jira Ticket QA' },
  { to: '/kt', label: 'New Joinee KT' },
  { to: '/maintenance', label: 'Maintenance' },
  { to: '/call-qa', label: 'Call QA' },
];

export function App() {
  const { role, setRole } = useRole();
  return (
    <div className="app">
      <aside className="sidebar">
        <h1>QA Management</h1>
        {nav.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => (isActive ? 'active' : '')}>
            {n.label}
          </NavLink>
        ))}
        <div className="spacer" />
        <div className="role-box">
          <label htmlFor="role">Active role</label>
          <select id="role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
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
        </Routes>
      </main>
    </div>
  );
}
