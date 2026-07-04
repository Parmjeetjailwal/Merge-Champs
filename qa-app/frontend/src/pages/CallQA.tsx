import { useEffect, useState } from 'react';
import { api, apiError } from '../api';
import { useRole } from '../RoleContext';
import { can } from '../perms';
import { useToast } from '../ui/Toast';
import { useConfirm } from '../ui/Confirm';
import { DataTable } from '../ui/DataTable';
import type { CallEvaluation, CallQaView, Employee } from '../types';

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const defaultForm = () => ({
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

export function CallQA() {
  const { role } = useRole();
  const editable = can.callQa(role);
  const toast = useToast();
  const confirm = useConfirm();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [periods, setPeriods] = useState<string[]>([]);
  const [period, setPeriod] = useState<string>('');
  const [view, setView] = useState<CallQaView | null>(null);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(defaultForm());

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

  const resetForm = () => {
    setEditingId(null);
    setForm(defaultForm());
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.employeeId || !form.callReference) {
      setError('Agent and call reference are required.');
      return;
    }
    try {
      if (editingId) {
        await api.patch(`/call-qa/${editingId}`, form);
        toast.success('Evaluation updated.');
      } else {
        await api.post('/call-qa', form);
        toast.success('Call evaluation saved.');
      }
      resetForm();
      const p = await api.get<string[]>('/call-qa/periods');
      setPeriods(p.data);
      load(form.callDate.slice(0, 7));
    } catch (err) {
      const msg = apiError(err);
      setError(msg);
      toast.error(msg);
    }
  };

  const startEdit = (ev: CallEvaluation) => {
    setEditingId(ev.id);
    setForm({
      employeeId: ev.employeeId,
      callReference: ev.callReference,
      callDate: ev.callDate.slice(0, 10),
      callOpeningScore: ev.callOpeningScore,
      infoCapturedScore: ev.infoCapturedScore,
      deadAirScore: ev.deadAirScore,
      callClosingScore: ev.callClosingScore,
      deadAirIncidents: ev.deadAirIncidents,
      caseCreationTimeSecs: ev.caseCreationTimeSecs,
      callCloseTimeSecs: ev.callCloseTimeSecs,
      comments: ev.comments ?? '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const remove = async (ev: CallEvaluation) => {
    const ok = await confirm({
      title: 'Delete evaluation',
      message: `Delete evaluation ${ev.callReference} (${ev.agent.name})?`,
      danger: true,
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    try {
      await api.delete(`/call-qa/${ev.id}`);
      toast.success('Evaluation deleted.');
      if (editingId === ev.id) resetForm();
      load(period);
    } catch (err) {
      toast.error(apiError(err));
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
          <h3>{editingId ? 'Edit call evaluation' : 'Add call evaluation'}</h3>
          <form className="stack" onSubmit={submit}>
            <div className="row">
              <label className="field">
                Agent
                <select value={form.employeeId} disabled={!!editingId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}>
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
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" type="submit">
                {editingId ? 'Update evaluation' : 'Save evaluation'}
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
        <h3>Evaluations — {period || '—'}</h3>
        <DataTable
          rows={view?.evaluations ?? []}
          rowKey={(e) => e.id}
          emptyText="No evaluations for this period."
          columns={[
            { key: 'call', header: 'Call', value: (e) => e.callReference },
            { key: 'agent', header: 'Agent', value: (e) => e.agent.name },
            { key: 'open', header: 'Open', align: 'right', value: (e) => e.callOpeningScore },
            { key: 'info', header: 'Info', align: 'right', value: (e) => e.infoCapturedScore },
            { key: 'deadair', header: 'Dead air', align: 'right', value: (e) => e.deadAirScore },
            { key: 'close', header: 'Close', align: 'right', value: (e) => e.callClosingScore },
            {
              key: 'casetime',
              header: 'Case time',
              align: 'right',
              value: (e) => e.caseCreationTimeSecs,
              render: (e) => (
                <>
                  {e.caseCreationTimeSecs}s{e.caseCreationBreached && <span className="badge bad">!</span>}
                </>
              ),
            },
            {
              key: 'closetime',
              header: 'Close time',
              align: 'right',
              value: (e) => e.callCloseTimeSecs,
              render: (e) => (
                <>
                  {e.callCloseTimeSecs}s{e.callCloseBreached && <span className="badge bad">!</span>}
                </>
              ),
            },
            { key: 'total', header: 'Total', align: 'right', value: (e) => e.totalScore, render: (e) => <b>{e.totalScore}</b> },
          ]}
          actions={
            editable
              ? (e) => (
                  <span className="row-actions">
                    <button className="btn secondary icon" onClick={() => startEdit(e)}>
                      Edit
                    </button>
                    <button className="btn danger icon" onClick={() => remove(e)}>
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
