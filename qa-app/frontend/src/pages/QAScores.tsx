import { useEffect, useState } from 'react';
import { api, apiError } from '../api';
import { useRole } from '../RoleContext';
import { can } from '../perms';
import type { Employee, QAReport, QAScore } from '../types';

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function QAScores() {
  const { role } = useRole();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [period, setPeriod] = useState<string>(currentMonth());
  const [scores, setScores] = useState<QAScore[]>([]);
  const [report, setReport] = useState<QAReport | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [form, setForm] = useState({
    employeeId: '',
    jiraTicketKey: '',
    timelinessScore: 4,
    documentationScore: 4,
    evaluationDate: `${currentMonth()}-15`,
    comments: '',
  });

  const loadScores = (p: string) => {
    api.get<QAScore[]>('/qa-scores', { params: { period: p } }).then((r) => setScores(r.data)).catch((e) => setError(apiError(e)));
  };

  useEffect(() => {
    api.get<Employee[]>('/employees').then((r) => setEmployees(r.data));
  }, []);
  useEffect(() => {
    loadScores(period);
    setReport(null);
  }, [period]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    if (!form.employeeId || !form.jiraTicketKey) {
      setError('Team member and Jira ticket key are required.');
      return;
    }
    try {
      await api.post('/qa-scores', form);
      setMessage('QA score saved.');
      setForm({ ...form, jiraTicketKey: '', comments: '' });
      loadScores(period);
    } catch (err) {
      setError(apiError(err));
    }
  };

  const generateReport = async () => {
    setError('');
    try {
      const r = await api.get<QAReport>('/qa-scores/report', { params: { period } });
      setReport(r.data);
    } catch (err) {
      setError(apiError(err));
    }
  };

  const sendToPmi = async () => {
    if (!report) return;
    try {
      const r = await api.post(`/qa-scores/report/${report.reportId}/send-pmi`);
      setMessage(r.data.note);
      setReport({ ...report, exportedToPMI: true });
    } catch (err) {
      setError(apiError(err));
    }
  };

  return (
    <div>
      <h2 className="page-title">Jira Ticket QA</h2>
      <p className="page-sub">
        QA score = timely response + documentation quality. Generate a report and send it to the PMI application.
      </p>

      <div className="toolbar">
        <label className="muted">Period</label>
        <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
        <button className="btn" onClick={generateReport}>
          Generate QA report
        </button>
        <a className="btn secondary" href={`/api/qa-scores/report/export.csv?period=${period}`}>
          Export CSV
        </a>
      </div>

      {error && <div className="notice error">{error}</div>}
      {message && <div className="notice success">{message}</div>}

      <div className="grid grid-2">
        {can.qa(role) && (
          <div className="card no-print">
            <h3>Add QA score</h3>
            <form className="stack" onSubmit={submit}>
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
              <label className="field">
                Jira ticket key
                <input
                  value={form.jiraTicketKey}
                  onChange={(e) => setForm({ ...form, jiraTicketKey: e.target.value })}
                  placeholder="PROJ-123"
                />
              </label>
              <div className="row">
                <label className="field">
                  Timeliness (0–5)
                  <input
                    type="number"
                    min={0}
                    max={5}
                    step={0.5}
                    value={form.timelinessScore}
                    onChange={(e) => setForm({ ...form, timelinessScore: Number(e.target.value) })}
                  />
                </label>
                <label className="field">
                  Documentation (0–5)
                  <input
                    type="number"
                    min={0}
                    max={5}
                    step={0.5}
                    value={form.documentationScore}
                    onChange={(e) => setForm({ ...form, documentationScore: Number(e.target.value) })}
                  />
                </label>
              </div>
              <label className="field">
                Evaluation date
                <input
                  type="date"
                  value={form.evaluationDate}
                  onChange={(e) => setForm({ ...form, evaluationDate: e.target.value })}
                />
              </label>
              <label className="field">
                Comments
                <input value={form.comments} onChange={(e) => setForm({ ...form, comments: e.target.value })} />
              </label>
              <button className="btn" type="submit">
                Save score
              </button>
            </form>
          </div>
        )}

        <div className="card">
          <h3>Scores — {period}</h3>
          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th>Ticket</th>
                <th className="right">Time</th>
                <th className="right">Docs</th>
                <th className="right">Total</th>
              </tr>
            </thead>
            <tbody>
              {scores.map((s) => (
                <tr key={s.id}>
                  <td>{s.agent.name}</td>
                  <td className="mono">{s.jiraTicketKey}</td>
                  <td className="right mono">{s.timelinessScore}</td>
                  <td className="right mono">{s.documentationScore}</td>
                  <td className="right mono">
                    <b>{s.totalScore}</b>
                  </td>
                </tr>
              ))}
              {scores.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    No scores for this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {report && (
        <div className="card" style={{ marginTop: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3>QA Report — {report.payload.period}</h3>
            <div className="no-print" style={{ display: 'flex', gap: 8 }}>
              <button className="btn secondary sm" onClick={() => window.print()}>
                Print / Save as PDF
              </button>
              {can.qa(role) && (
                <button className="btn sm" onClick={sendToPmi} disabled={report.exportedToPMI}>
                  {report.exportedToPMI ? 'Sent to PMI' : 'Send to PMI'}
                </button>
              )}
            </div>
          </div>
          <p className="muted" style={{ fontSize: 13 }}>
            Weighting: timeliness {report.weighting.timeliness} / documentation {report.weighting.documentation} · scale 0–
            {report.weighting.scaleMax}
          </p>
          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th className="right">Tickets</th>
                <th className="right">Avg timeliness</th>
                <th className="right">Avg documentation</th>
                <th className="right">Avg total</th>
              </tr>
            </thead>
            <tbody>
              {report.payload.teamMembers.map((m) => (
                <tr key={m.employeeId}>
                  <td>{m.name}</td>
                  <td className="right mono">{m.ticketsEvaluated}</td>
                  <td className="right mono">{m.avgTimeliness}</td>
                  <td className="right mono">{m.avgDocumentation}</td>
                  <td className="right mono">
                    <b>{m.avgTotalScore}</b>
                  </td>
                </tr>
              ))}
              {report.payload.teamMembers.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    No data for this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
