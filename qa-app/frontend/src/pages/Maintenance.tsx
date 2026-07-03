import { useEffect, useState } from 'react';
import { api, apiError } from '../api';
import { useRole } from '../RoleContext';
import { can } from '../perms';
import type { Employee, MaintenanceView } from '../types';

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function Maintenance() {
  const { role } = useRole();
  const editable = can.maintenance(role);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [months, setMonths] = useState<string[]>([]);
  const [month, setMonth] = useState<string>('');
  const [view, setView] = useState<MaintenanceView | null>(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    title: '',
    employeeId: '',
    scheduledStart: `${currentMonth()}-10T22:00`,
    scheduledEnd: `${currentMonth()}-10T23:00`,
    actualStart: `${currentMonth()}-10T22:00`,
    actualEnd: `${currentMonth()}-10T23:15`,
  });

  const load = (m?: string) => {
    setError('');
    api
      .get<MaintenanceView>('/maintenance', { params: m ? { month: m } : {} })
      .then((r) => {
        setView(r.data);
        if (r.data.month) setMonth(r.data.month);
      })
      .catch((e) => setError(apiError(e)));
  };

  useEffect(() => {
    api.get<Employee[]>('/employees').then((r) => setEmployees(r.data));
    api.get<string[]>('/maintenance/months').then((r) => setMonths(r.data));
    load();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.title || !form.employeeId) {
      setError('Title and team member are required.');
      return;
    }
    try {
      await api.post('/maintenance', form);
      setForm({ ...form, title: '' });
      const m = await api.get<string[]>('/maintenance/months');
      setMonths(m.data);
      load(form.scheduledStart.slice(0, 7));
    } catch (err) {
      setError(apiError(err));
    }
  };

  return (
    <div>
      <h2 className="page-title">Maintenance Activity</h2>
      <p className="page-sub">
        Tracks whether activities stayed within their scheduled time. Highlights the top maintainer and anyone who missed
        the timeline.
      </p>

      <div className="toolbar">
        <label className="muted">Month</label>
        <select
          value={month}
          onChange={(e) => {
            setMonth(e.target.value);
            load(e.target.value);
          }}
        >
          {months.length === 0 && <option value="">(no data)</option>}
          {months.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      {error && <div className="notice error">{error}</div>}

      <div className="grid grid-2" style={{ marginBottom: 18 }}>
        <div className="card">
          <h3>Top maintainer of the month</h3>
          {view?.topMaintainer ? (
            <p>
              <span className="badge top">{view.topMaintainer.name}</span> — {view.topMaintainer.count} activities (
              {view.topMaintainer.withinTime} within time, {view.topMaintainer.exceeded} exceeded)
            </p>
          ) : (
            <p className="muted">No activities this month.</p>
          )}
        </div>
        <div className="card">
          <h3>Missed timeline</h3>
          <ul className="list">
            {(view?.missedTimeline ?? []).map((m) => (
              <li key={m.employeeId}>
                <span>
                  <span className="badge bad">MISSED</span> {m.name}
                </span>
                <span className="muted mono">
                  {m.exceededCount} activity(ies), +
                  {m.activities.reduce((a, x) => a + x.exceededByMinutes, 0)} min
                </span>
              </li>
            ))}
            {(view?.missedTimeline ?? []).length === 0 && <li className="muted">Everyone stayed within schedule.</li>}
          </ul>
        </div>
      </div>

      {editable && (
        <div className="card no-print" style={{ marginBottom: 18 }}>
          <h3>Log maintenance activity</h3>
          <form className="stack" onSubmit={submit}>
            <div className="row">
              <label className="field">
                Title
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </label>
              <label className="field">
                Team member
                <select value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}>
                  <option value="">Select…</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="row">
              <label className="field">
                Scheduled start
                <input
                  type="datetime-local"
                  value={form.scheduledStart}
                  onChange={(e) => setForm({ ...form, scheduledStart: e.target.value })}
                />
              </label>
              <label className="field">
                Scheduled end
                <input
                  type="datetime-local"
                  value={form.scheduledEnd}
                  onChange={(e) => setForm({ ...form, scheduledEnd: e.target.value })}
                />
              </label>
            </div>
            <div className="row">
              <label className="field">
                Actual start
                <input
                  type="datetime-local"
                  value={form.actualStart}
                  onChange={(e) => setForm({ ...form, actualStart: e.target.value })}
                />
              </label>
              <label className="field">
                Actual end
                <input
                  type="datetime-local"
                  value={form.actualEnd}
                  onChange={(e) => setForm({ ...form, actualEnd: e.target.value })}
                />
              </label>
            </div>
            <button className="btn" type="submit">
              Save activity
            </button>
          </form>
        </div>
      )}

      <div className="card">
        <h3>Activities — {month || '—'}</h3>
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Member</th>
              <th>Status</th>
              <th className="right">Exceeded by</th>
            </tr>
          </thead>
          <tbody>
            {(view?.activities ?? []).map((a) => (
              <tr key={a.id}>
                <td>{a.title}</td>
                <td>{a.employee.name}</td>
                <td>
                  {a.status === 'Exceeded' ? (
                    <span className="badge bad">Exceeded</span>
                  ) : (
                    <span className="badge good">Within time</span>
                  )}
                </td>
                <td className="right mono">{a.exceededByMinutes ? `${a.exceededByMinutes} min` : '—'}</td>
              </tr>
            ))}
            {(view?.activities ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="muted">
                  No activities for this month.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
