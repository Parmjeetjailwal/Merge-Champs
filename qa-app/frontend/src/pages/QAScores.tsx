import { useEffect, useState } from 'react';
import { api, apiError } from '../api';
import { useRole } from '../RoleContext';
import { can } from '../perms';
import { useToast } from '../ui/Toast';
import { useConfirm } from '../ui/Confirm';
import { DataTable } from '../ui/DataTable';
import type { Employee, QAReport, QAReportSummary, QAScore } from '../types';

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function QAScores() {
  const { role } = useRole();
  const toast = useToast();
  const confirm = useConfirm();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [period, setPeriod] = useState<string>(currentMonth());
  const [scores, setScores] = useState<QAScore[]>([]);
  const [report, setReport] = useState<QAReport | null>(null);
  const [reports, setReports] = useState<QAReportSummary[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState('');

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

  const loadReports = () => {
    api.get<QAReportSummary[]>('/qa-scores/reports').then((r) => setReports(r.data)).catch(() => {});
  };

  useEffect(() => {
    api.get<Employee[]>('/employees').then((r) => setEmployees(r.data));
    loadReports();
  }, []);
  useEffect(() => {
    loadScores(period);
    setReport(null);
  }, [period]);

  const resetForm = () => {
    setEditingId(null);
    setForm({
      employeeId: '',
      jiraTicketKey: '',
      timelinessScore: 4,
      documentationScore: 4,
      evaluationDate: `${currentMonth()}-15`,
      comments: '',
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.employeeId || !form.jiraTicketKey) {
      setError('Team member and Jira ticket key are required.');
      return;
    }
    try {
      if (editingId) {
        await api.patch(`/qa-scores/${editingId}`, form);
        toast.success('QA score updated.');
      } else {
        await api.post('/qa-scores', form);
        toast.success('QA score saved.');
      }
      resetForm();
      loadScores(period);
    } catch (err) {
      const msg = apiError(err);
      setError(msg);
      toast.error(msg);
    }
  };

  const startEdit = (s: QAScore) => {
    setEditingId(s.id);
    setForm({
      employeeId: s.employeeId,
      jiraTicketKey: s.jiraTicketKey,
      timelinessScore: s.timelinessScore,
      documentationScore: s.documentationScore,
      evaluationDate: s.evaluationDate.slice(0, 10),
      comments: s.comments ?? '',
    });
  };

  const remove = async (s: QAScore) => {
    const ok = await confirm({
      title: 'Delete score',
      message: `Delete the QA score for ${s.jiraTicketKey} (${s.agent.name})?`,
      danger: true,
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    try {
      await api.delete(`/qa-scores/${s.id}`);
      toast.success('QA score deleted.');
      if (editingId === s.id) resetForm();
      loadScores(period);
    } catch (err) {
      toast.error(apiError(err));
    }
  };

  const generateReport = async () => {
    setError('');
    try {
      const r = await api.get<QAReport>('/qa-scores/report', { params: { period } });
      setReport(r.data);
      loadReports();
    } catch (err) {
      const msg = apiError(err);
      setError(msg);
      toast.error(msg);
    }
  };

  const sendToPmi = async () => {
    if (!report) return;
    try {
      const r = await api.post(`/qa-scores/report/${report.reportId}/send-pmi`);
      toast.success(r.data.note);
      setReport({ ...report, exportedToPMI: true });
      loadReports();
    } catch (err) {
      toast.error(apiError(err));
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
        <a className="btn secondary" href={`/api/qa-scores/report/export.pdf?period=${period}`}>
          Export PDF
        </a>
      </div>

      {error && <div className="notice error">{error}</div>}

      <div className="grid grid-2">
        {can.qa(role) && (
          <div className="card no-print">
            <h3>{editingId ? 'Edit QA score' : 'Add QA score'}</h3>
            <form className="stack" onSubmit={submit}>
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
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn" type="submit">
                  {editingId ? 'Update score' : 'Save score'}
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
          <h3>Scores — {period}</h3>
          <DataTable
            rows={scores}
            rowKey={(s) => s.id}
            emptyText="No scores for this period."
            columns={[
              { key: 'member', header: 'Member', value: (s) => s.agent.name },
              { key: 'ticket', header: 'Ticket', value: (s) => s.jiraTicketKey },
              { key: 'time', header: 'Time', align: 'right', value: (s) => s.timelinessScore },
              { key: 'docs', header: 'Docs', align: 'right', value: (s) => s.documentationScore },
              { key: 'total', header: 'Total', align: 'right', value: (s) => s.totalScore, render: (s) => <b>{s.totalScore}</b> },
            ]}
            actions={
              can.qa(role)
                ? (s) => (
                    <span className="row-actions">
                      <button className="btn secondary icon" onClick={() => startEdit(s)}>
                        Edit
                      </button>
                      <button className="btn danger icon" onClick={() => remove(s)}>
                        Delete
                      </button>
                    </span>
                  )
                : undefined
            }
          />
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

      {reports.length > 0 && (
        <div className="card" style={{ marginTop: 18 }}>
          <h3>Saved reports</h3>
          <DataTable
            rows={reports}
            rowKey={(r) => r.id}
            pageSize={5}
            emptyText="No reports generated yet."
            columns={[
              { key: 'period', header: 'Period', value: (r) => r.period },
              { key: 'generated', header: 'Generated', value: (r) => new Date(r.generatedAt).toLocaleString() },
              {
                key: 'pmi',
                header: 'PMI',
                value: (r) => (r.exportedToPMI ? 'Exported' : 'Not sent'),
                render: (r) =>
                  r.exportedToPMI ? <span className="badge good">Exported</span> : <span className="badge warn">Not sent</span>,
              },
            ]}
            actions={(r) => (
              <a className="btn secondary icon" href={`/api/qa-scores/report/export.csv?period=${r.period}`}>
                CSV
              </a>
            )}
          />
        </div>
      )}
    </div>
  );
}
