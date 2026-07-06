import { useEffect, useRef, useState } from 'react';
import { api, apiError } from '../api';
import { useRole } from '../RoleContext';
import { can } from '../perms';
import { useToast } from '../ui/Toast';
import { useConfirm } from '../ui/Confirm';
import { DataTable } from '../ui/DataTable';
import type { Employee, MaintenanceActivity, MaintenanceView } from '../types';

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const defaultForm = () => ({
  title: '',
  employeeId: '',
  scheduledStart: `${currentMonth()}-10T22:00`,
  scheduledEnd: `${currentMonth()}-10T23:00`,
  actualStart: `${currentMonth()}-10T22:00`,
  actualEnd: `${currentMonth()}-10T23:15`,
});

export function Maintenance() {
  const { role } = useRole();
  const editable = can.maintenance(role);
  const toast = useToast();
  const confirm = useConfirm();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [months, setMonths] = useState<string[]>([]);
  const [month, setMonth] = useState<string>('');
  const [view, setView] = useState<MaintenanceView | null>(null);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(defaultForm());
  const fileRef = useRef<HTMLInputElement>(null);

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

  const onImport = async (e: React.FormEvent) => {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      toast.error('Choose an .xlsx/.xls/.csv file.');
      return;
    }
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await api.post('/maintenance/upload', fd);
      const { inserted, errors, totalRows } = r.data;
      toast.success(`Imported ${inserted}/${totalRows} activity row(s)${errors.length ? `, ${errors.length} error(s)` : ''}.`);
      if (fileRef.current) fileRef.current.value = '';
      const m = await api.get<string[]>('/maintenance/months');
      setMonths(m.data);
      load();
    } catch (err) {
      toast.error(apiError(err));
    }
  };

  useEffect(() => {
    api.get<Employee[]>('/employees').then((r) => setEmployees(r.data));
    api.get<string[]>('/maintenance/months').then((r) => setMonths(r.data));
    load();
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setForm(defaultForm());
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.title || !form.employeeId) {
      setError('Title and team member are required.');
      return;
    }
    try {
      if (editingId) {
        await api.patch(`/maintenance/${editingId}`, form);
        toast.success('Activity updated.');
      } else {
        await api.post('/maintenance', form);
        toast.success('Activity logged.');
      }
      resetForm();
      const m = await api.get<string[]>('/maintenance/months');
      setMonths(m.data);
      load(form.scheduledStart.slice(0, 7));
    } catch (err) {
      const msg = apiError(err);
      setError(msg);
      toast.error(msg);
    }
  };

  const toLocalInput = (iso: string) => iso.slice(0, 16);

  const startEdit = (a: MaintenanceActivity) => {
    setEditingId(a.id);
    setForm({
      title: a.title,
      employeeId: a.employeeId,
      scheduledStart: toLocalInput(a.scheduledStart),
      scheduledEnd: toLocalInput(a.scheduledEnd),
      actualStart: toLocalInput(a.actualStart),
      actualEnd: toLocalInput(a.actualEnd),
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const remove = async (a: MaintenanceActivity) => {
    const ok = await confirm({ title: 'Delete activity', message: `Delete "${a.title}"?`, danger: true, confirmLabel: 'Delete' });
    if (!ok) return;
    try {
      await api.delete(`/maintenance/${a.id}`);
      toast.success('Activity deleted.');
      if (editingId === a.id) resetForm();
      const m = await api.get<string[]>('/maintenance/months');
      setMonths(m.data);
      load(month);
    } catch (err) {
      toast.error(apiError(err));
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

      {editable && (
        <div className="card no-print" style={{ marginBottom: 18 }}>
          <h3>Import from Excel</h3>
          <form onSubmit={onImport} style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" />
            <button className="btn" type="submit">
              Upload
            </button>
            <a className="btn secondary" href="/api/templates/maintenance">
              Download template
            </a>
            <span className="muted" style={{ fontSize: 13 }}>
              Columns: Title, Team Member, Email, Scheduled Start, Scheduled End, Actual Start, Actual End
            </span>
          </form>
        </div>
      )}

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
          <h3>{editingId ? 'Edit maintenance activity' : 'Log maintenance activity'}</h3>
          <form className="stack" onSubmit={submit}>
            <div className="row">
              <label className="field">
                Title
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </label>
              <label className="field">
                Team member
                <select value={form.employeeId} disabled={!!editingId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}>
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
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" type="submit">
                {editingId ? 'Update activity' : 'Save activity'}
              </button>
              {editingId && (
                <button type="button" className="btn secondary" onClick={resetForm}>
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>
      )}

      <div className="card">
        <h3>Activities — {month || '—'}</h3>
        <DataTable
          rows={view?.activities ?? []}
          rowKey={(a) => a.id}
          emptyText="No activities for this month."
          columns={[
            { key: 'title', header: 'Title', value: (a) => a.title },
            { key: 'member', header: 'Member', value: (a) => a.employee.name },
            {
              key: 'status',
              header: 'Status',
              value: (a) => a.status,
              render: (a) =>
                a.status === 'Exceeded' ? (
                  <span className="badge bad">Exceeded</span>
                ) : (
                  <span className="badge good">Within time</span>
                ),
            },
            {
              key: 'exceeded',
              header: 'Exceeded by',
              align: 'right',
              value: (a) => a.exceededByMinutes,
              render: (a) => (a.exceededByMinutes ? `${a.exceededByMinutes} min` : '—'),
            },
          ]}
          actions={
            editable
              ? (a) => (
                  <span className="row-actions">
                    <button className="btn secondary icon" onClick={() => startEdit(a)}>
                      Edit
                    </button>
                    <button className="btn danger icon" onClick={() => remove(a)}>
                      Delete
                    </button>
                  </span>
                )
              : undefined
          }
        />
      </div>
    </div>
  );
}
