import { useEffect, useRef, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { api, apiError } from '../api';
import { useRole } from '../RoleContext';
import { can } from '../perms';
import type { TimeView } from '../types';

export function TimeUtilization() {
  const { role } = useRole();
  const [periods, setPeriods] = useState<string[]>([]);
  const [period, setPeriod] = useState<string>('');
  const [view, setView] = useState<TimeView | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
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
            <span className="muted" style={{ fontSize: 13 }}>
              Columns: Employee Name, Email, Team, Period, Planned Hours, Actual/Billable Hours
            </span>
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
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th className="right">Planned</th>
                  <th className="right">Actual</th>
                  <th className="right">Util %</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {view.records.map((r) => (
                  <tr key={r.id} className={ids.top.has(r.id) || ids.bottom.has(r.id) ? 'highlight-row' : ''}>
                    <td>{r.employee.name}</td>
                    <td className="right mono">{r.plannedHours}</td>
                    <td className="right mono">{r.actualHours}</td>
                    <td className="right mono">
                      <b>{r.utilizationPercent}%</b>
                    </td>
                    <td>
                      {ids.top.has(r.id) && <span className="badge top">TOP</span>}
                      {ids.bottom.has(r.id) && <span className="badge warn">LOW</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        !error && <p className="muted">No records for this period. Upload an Excel sheet to get started.</p>
      )}
    </div>
  );
}
