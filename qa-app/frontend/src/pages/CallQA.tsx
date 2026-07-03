import { useEffect, useState } from 'react';
import { api, apiError } from '../api';
import { useRole } from '../RoleContext';
import { can } from '../perms';
import type { CallQaView, Employee } from '../types';

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function CallQA() {
  const { role } = useRole();
  const editable = can.callQa(role);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [periods, setPeriods] = useState<string[]>([]);
  const [period, setPeriod] = useState<string>('');
  const [view, setView] = useState<CallQaView | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({
    employeeId: '',
    callReference: '',
    callDate: `${currentMonth()}-15`,
    callOpeningScore: 5,
    infoCapturedScore: 5,
    deadAirScore: 5,
    callClosingScore: 5,
    deadAirIncidents: 0,
    caseCreationTimeSecs: 90,
    callCloseTimeSecs: 40,
    comments: '',
  });

  const load = (p?: string) => {
    setError('');
    api
      .get<CallQaView>('/call-qa', { params: p ? { period: p } : {} })
      .then((r) => {
        setView(r.data);
        if (r.data.period) setPeriod(r.data.period);
      })
      .catch((e) => setError(apiError(e)));
  };

  useEffect(() => {
    api.get<Employee[]>('/employees').then((r) => setEmployees(r.data));
    api.get<string[]>('/call-qa/periods').then((r) => setPeriods(r.data));
    load();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    if (!form.employeeId || !form.callReference) {
      setError('Agent and call reference are required.');
      return;
    }
    try {
      await api.post('/call-qa', form);
      setMessage('Call evaluation saved.');
      setForm({ ...form, callReference: '', comments: '' });
      const p = await api.get<string[]>('/call-qa/periods');
      setPeriods(p.data);
      load(form.callDate.slice(0, 7));
    } catch (err) {
      setError(apiError(err));
    }
  };

  const th = view?.thresholds;

  return (
    <div>
      <h2 className="page-title">Call QA</h2>
      <p className="page-sub">
        Call quality on opening, information captured, dead air, closing, plus case-creation &amp; call-close times.
      </p>

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
        {th && (
          <span className="muted" style={{ fontSize: 13 }}>
            Thresholds: case ≤ {th.caseCreationSecs}s · close ≤ {th.callCloseSecs}s
          </span>
        )}
      </div>

      {error && <div className="notice error">{error}</div>}
      {message && <div className="notice success">{message}</div>}

      <div className="grid grid-2" style={{ marginBottom: 18 }}>
        <div className="card">
          <h3>Score by parameter</h3>
          <ul className="list">
            {(view?.perParameter ?? []).map((p) => (
              <li key={p.key}>
                <span>
                  {p.label}
                  {view?.topImprovementArea?.key === p.key && (
                    <>
                      {' '}
                      <span className="badge warn">TOP IMPROVEMENT AREA</span>
                    </>
                  )}
                </span>
                <b className="mono">{p.avg}</b>
              </li>
            ))}
            {(view?.perParameter ?? []).length === 0 && <li className="muted">No evaluations yet.</li>}
          </ul>
        </div>
        <div className="card">
          <h3>Average score by agent</h3>
          <ul className="list">
            {(view?.perAgent ?? []).map((a) => (
              <li key={a.employeeId}>
                <span>{a.name}</span>
                <b className="mono">{a.avgScore}</b>
              </li>
            ))}
            {(view?.perAgent ?? []).length === 0 && <li className="muted">No evaluations yet.</li>}
          </ul>
        </div>
      </div>

      {editable && (
        <div className="card no-print" style={{ marginBottom: 18 }}>
          <h3>Add call evaluation</h3>
          <form className="stack" onSubmit={submit}>
            <div className="row">
              <label className="field">
                Agent
                <select value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}>
                  <option value="">Select…</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Call reference
                <input
                  value={form.callReference}
                  onChange={(e) => setForm({ ...form, callReference: e.target.value })}
                  placeholder="CALL-1234"
                />
              </label>
            </div>
            <label className="field">
              Call date
              <input type="date" value={form.callDate} onChange={(e) => setForm({ ...form, callDate: e.target.value })} />
            </label>
            <div className="row">
              <label className="field">
                Call opening (0–5)
                <input
                  type="number"
                  min={0}
                  max={5}
                  step={0.5}
                  value={form.callOpeningScore}
                  onChange={(e) => setForm({ ...form, callOpeningScore: Number(e.target.value) })}
                />
              </label>
              <label className="field">
                Information captured (0–5)
                <input
                  type="number"
                  min={0}
                  max={5}
                  step={0.5}
                  value={form.infoCapturedScore}
                  onChange={(e) => setForm({ ...form, infoCapturedScore: Number(e.target.value) })}
                />
              </label>
            </div>
            <div className="row">
              <label className="field">
                No dead air (0–5)
                <input
                  type="number"
                  min={0}
                  max={5}
                  step={0.5}
                  value={form.deadAirScore}
                  onChange={(e) => setForm({ ...form, deadAirScore: Number(e.target.value) })}
                />
              </label>
              <label className="field">
                Call closing (0–5)
                <input
                  type="number"
                  min={0}
                  max={5}
                  step={0.5}
                  value={form.callClosingScore}
                  onChange={(e) => setForm({ ...form, callClosingScore: Number(e.target.value) })}
                />
              </label>
            </div>
            <div className="row">
              <label className="field">
                Case creation time (secs)
                <input
                  type="number"
                  min={0}
                  value={form.caseCreationTimeSecs}
                  onChange={(e) => setForm({ ...form, caseCreationTimeSecs: Number(e.target.value) })}
                />
              </label>
              <label className="field">
                Call close time (secs)
                <input
                  type="number"
                  min={0}
                  value={form.callCloseTimeSecs}
                  onChange={(e) => setForm({ ...form, callCloseTimeSecs: Number(e.target.value) })}
                />
              </label>
            </div>
            <label className="field">
              Dead-air incidents
              <input
                type="number"
                min={0}
                value={form.deadAirIncidents}
                onChange={(e) => setForm({ ...form, deadAirIncidents: Number(e.target.value) })}
              />
            </label>
            <label className="field">
              Comments
              <input value={form.comments} onChange={(e) => setForm({ ...form, comments: e.target.value })} />
            </label>
            <button className="btn" type="submit">
              Save evaluation
            </button>
          </form>
        </div>
      )}

      <div className="card">
        <h3>Evaluations — {period || '—'}</h3>
        <table>
          <thead>
            <tr>
              <th>Call</th>
              <th>Agent</th>
              <th className="right">Open</th>
              <th className="right">Info</th>
              <th className="right">Dead air</th>
              <th className="right">Close</th>
              <th className="right">Case time</th>
              <th className="right">Close time</th>
              <th className="right">Total</th>
            </tr>
          </thead>
          <tbody>
            {(view?.evaluations ?? []).map((e) => (
              <tr key={e.id}>
                <td className="mono">{e.callReference}</td>
                <td>{e.agent.name}</td>
                <td className="right mono">{e.callOpeningScore}</td>
                <td className="right mono">{e.infoCapturedScore}</td>
                <td className="right mono">{e.deadAirScore}</td>
                <td className="right mono">{e.callClosingScore}</td>
                <td className="right mono">
                  {e.caseCreationTimeSecs}s{e.caseCreationBreached && <span className="badge bad">!</span>}
                </td>
                <td className="right mono">
                  {e.callCloseTimeSecs}s{e.callCloseBreached && <span className="badge bad">!</span>}
                </td>
                <td className="right mono">
                  <b>{e.totalScore}</b>
                </td>
              </tr>
            ))}
            {(view?.evaluations ?? []).length === 0 && (
              <tr>
                <td colSpan={9} className="muted">
                  No evaluations for this period.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
