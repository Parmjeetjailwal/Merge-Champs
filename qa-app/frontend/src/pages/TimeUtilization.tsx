import { useEffect, useRef, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { api, apiError } from '../api';
import { useRole } from '../RoleContext';
import { can } from '../perms';
import { useToast } from '../ui/Toast';
import { useConfirm } from '../ui/Confirm';
import { DataTable } from '../ui/DataTable';
import { TrendChart } from '../ui/TrendChart';
import type { Employee, TimeRecord, TimeView, TrendPoint } from '../types';

export function TimeUtilization() {
  const { role } = useRole();
  const editable = can.uploadTime(role);
  const toast = useToast();
  const confirm = useConfirm();
  const [periods, setPeriods] = useState<string[]>([]);
  const [period, setPeriod] = useState<string>('');
  const [view, setView] = useState<TimeView | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [manual, setManual] = useState({ employeeId: '', period: '', plannedHours: 160, actualHours: 150 });
  const [target, setTarget] = useState(85);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = (p?: string) => {
    setError('');
    api
      .get<TimeView>('/time-utilization', { params: p ? { period: p } : {} })
      .then((r) => {
        setView(r.data);
        if (r.data.period) setPeriod(r.data.period);
      })
      .catch((e) => setError(apiError(e)));
  };

  useEffect(() => {
    api.get<string[]>('/time-utilization/periods').then((r) => setPeriods(r.data));
    api.get<Employee[]>('/employees').then((r) => setEmployees(r.data));
    api
      .get<{ timeUtilization: { targetPercent: number } }>('/settings')
      .then((r) => setTarget(r.data.timeUtilization.targetPercent))
      .catch(() => {});
    api.get<TrendPoint[]>('/time-utilization/trend').then((r) => setTrend(r.data)).catch(() => {});
    load();
  }, []);

  const onUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError('Please choose an .xlsx/.xls/.csv file.');
      return;
    }
    const form = new FormData();
    form.append('file', file);
    try {
      const r = await api.post('/time-utilization/upload', form);
      const { inserted, updated, errors, totalRows } = r.data;
      setMessage(`Processed ${totalRows} rows: ${inserted} inserted, ${updated} updated, ${errors.length} error(s).`);
      const periodsRes = await api.get<string[]>('/time-utilization/periods');
      setPeriods(periodsRes.data);
      if (r.data.view?.period) {
        setView(r.data.view);
        setPeriod(r.data.view.period);
      }
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      setError(apiError(err));
    }
  };

  const resetManual = () => {
    setEditingId(null);
    setManual({ employeeId: '', period: period || '', plannedHours: 160, actualHours: 150 });
  };

  const submitManual = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const wasEditing = editingId;
    try {
      if (wasEditing) {
        await api.patch(`/time-utilization/${wasEditing}`, {
          plannedHours: manual.plannedHours,
          actualHours: manual.actualHours,
        });
        toast.success('Record updated.');
      } else {
        if (!manual.employeeId || !manual.period) {
          setError('Employee and period are required.');
          return;
        }
        await api.post('/time-utilization', manual);
        toast.success('Record saved.');
      }
      const targetPeriod = wasEditing ? period : manual.period;
      resetManual();
      const periodsRes = await api.get<string[]>('/time-utilization/periods');
      setPeriods(periodsRes.data);
      load(targetPeriod);
    } catch (err) {
      const msg = apiError(err);
      setError(msg);
      toast.error(msg);
    }
  };

  const startEdit = (r: TimeRecord) => {
    setEditingId(r.id);
    setManual({ employeeId: r.employeeId, period: r.period, plannedHours: r.plannedHours, actualHours: r.actualHours });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const removeRecord = async (r: TimeRecord) => {
    const ok = await confirm({
      title: 'Delete record',
      message: `Delete ${r.employee.name}'s record for ${r.period}?`,
      danger: true,
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    try {
      await api.delete(`/time-utilization/${r.id}`);
      toast.success('Record deleted.');
      if (editingId === r.id) resetManual();
      load(period);
    } catch (err) {
      toast.error(apiError(err));
    }
  };

  const ids = {
    top: new Set(view?.top.map((r) => r.id)),
    bottom: new Set(view?.bottom.map((r) => r.id)),
  };
  const chartData = (view?.records ?? []).map((r) => ({ name: r.employee.name, utilization: r.utilizationPercent }));

  return (
    <div>
      <h2 className="page-title">Time Utilization</h2>
      <p className="page-sub">Imported from Excel. Highlights the top 2 and bottom 2 by utilization.</p>

      <div className="toolbar">
        <label className="muted">Period</label>
        <select
          value={period}
          onChange={(e) => {
            setPeriod(e.target.value);
            load(e.target.value);
          }}
        >
          {periods.length === 0 && <option value="">(no data)</option>}
          {periods.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      {error && <div className="notice error">{error}</div>}
      {message && <div className="notice success">{message}</div>}

      {can.uploadTime(role) && (
        <div className="card no-print" style={{ marginBottom: 18 }}>
          <h3>Import Excel sheet</h3>
          <form onSubmit={onUpload} style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" />
            <button className="btn" type="submit">
              Upload
            </button>
            <a className="btn secondary" href="/api/templates/time-utilization">
              Download template
            </a>
            <span className="muted" style={{ fontSize: 13 }}>
              Columns: Employee Name, Email, Team, Period, Planned Hours, Actual/Billable Hours
            </span>
          </form>
        </div>
      )}

      {editable && (
        <div className="card no-print" style={{ marginBottom: 18 }}>
          <h3>{editingId ? 'Edit record' : 'Add record manually'}</h3>
          <form className="stack" onSubmit={submitManual}>
            <div className="row">
              <label className="field">
                Employee
                <select
                  value={manual.employeeId}
                  disabled={!!editingId}
                  onChange={(e) => setManual({ ...manual, employeeId: e.target.value })}
                >
                  <option value="">Select…</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Period (YYYY-MM)
                <input
                  value={manual.period}
                  disabled={!!editingId}
                  onChange={(e) => setManual({ ...manual, period: e.target.value })}
                  placeholder="2026-07"
                />
              </label>
            </div>
            <div className="row">
              <label className="field">
                Planned hours
                <input
                  type="number"
                  min={0}
                  value={manual.plannedHours}
                  onChange={(e) => setManual({ ...manual, plannedHours: Number(e.target.value) })}
                />
              </label>
              <label className="field">
                Actual/billable hours
                <input
                  type="number"
                  min={0}
                  value={manual.actualHours}
                  onChange={(e) => setManual({ ...manual, actualHours: Number(e.target.value) })}
                />
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" type="submit">
                {editingId ? 'Update record' : 'Add record'}
              </button>
              {editingId && (
                <button type="button" className="btn secondary" onClick={resetManual}>
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>
      )}

      {view && view.records.length > 0 ? (
        <div className="grid grid-2">
          <div className="card">
            <h3>Utilization by employee</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: -18 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={54} />
                <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} />
                <Tooltip />
                <Bar dataKey="utilization" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="card">
            <h3>Records</h3>
            <DataTable
              rows={view.records}
              rowKey={(r) => r.id}
              rowClassName={(r) => (ids.top.has(r.id) || ids.bottom.has(r.id) ? 'highlight-row' : '')}
              emptyText="No records for this period."
              columns={[
                { key: 'employee', header: 'Employee', value: (r) => r.employee.name },
                { key: 'planned', header: 'Planned', align: 'right', value: (r) => r.plannedHours },
                { key: 'actual', header: 'Actual', align: 'right', value: (r) => r.actualHours },
                {
                  key: 'util',
                  header: 'Util %',
                  align: 'right',
                  value: (r) => r.utilizationPercent,
                  render: (r) => {
                    const c =
                      r.utilizationPercent >= target
                        ? 'var(--good)'
                        : r.utilizationPercent >= target - 10
                        ? 'var(--warn)'
                        : 'var(--bad)';
                    return <b style={{ color: c }}>{r.utilizationPercent}%</b>;
                  },
                },
                {
                  key: 'flag',
                  header: '',
                  sortable: false,
                  searchable: false,
                  render: (r) => (
                    <>
                      {ids.top.has(r.id) && <span className="badge top">TOP</span>}
                      {ids.bottom.has(r.id) && <span className="badge warn">LOW</span>}
                    </>
                  ),
                },
              ]}
              actions={
                editable
                  ? (r) => (
                      <span className="row-actions">
                        <button className="btn secondary icon" onClick={() => startEdit(r)}>
                          Edit
                        </button>
                        <button className="btn danger icon" onClick={() => removeRecord(r)}>
                          Delete
                        </button>
                      </span>
                    )
                  : undefined
              }
            />
          </div>
          <div className="card">
            <h3>Utilization trend</h3>
            <TrendChart data={trend} color="#2563eb" />
          </div>
        </div>
      ) : (
        !error && <p className="muted">No records for this period. Upload an Excel sheet to get started.</p>
      )}
    </div>
  );
}
