import { useEffect, useMemo, useRef, useState } from 'react';
import { api, apiError } from '../api';
import { useRole } from '../RoleContext';
import { can } from '../perms';
import { useToast } from '../ui/Toast';
import { useConfirm } from '../ui/Confirm';
import { DataTable } from '../ui/DataTable';
import type { CallEvaluation, CallQaView, Employee, QcAnswer, QcParameter, QcParameters } from '../types';

const ANSWERS: QcAnswer[] = ['YES', 'NO', 'NA'];
const ANSWER_LABEL: Record<QcAnswer, string> = { YES: 'Yes', NO: 'No', NA: 'NA' };

type AnswerState = Record<string, { answer: QcAnswer | ''; comment: string }>;

function nowLocal(): string {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

const emptyHeader = () => ({
  product: '',
  caseNo: '',
  callDateTime: nowLocal(),
  ticketCreatedDateTime: '',
  userName: '',
  callHandledById: '',
  caseOwnerId: '',
  analystId: '',
  customerEscalation: false,
  findings: '',
  actionPlan: '',
});

/** Yes / applicable / adherence% for a section from the in-progress answers. */
function sectionStats(params: QcParameter[], answers: AnswerState) {
  let yes = 0;
  let no = 0;
  for (const p of params) {
    const a = answers[p.id]?.answer;
    if (a === 'YES') yes++;
    else if (a === 'NO') no++;
  }
  const applicable = yes + no;
  return { yes, applicable, adherence: applicable === 0 ? null : Math.round((yes / applicable) * 1000) / 10 };
}

const pct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${v}%`);

function ragClass(v: number | null | undefined, target: number): string {
  if (v === null || v === undefined) return '';
  if (v >= target) return 'rag-good';
  if (v >= target - 10) return 'rag-warn';
  return 'rag-bad';
}

const answerBadgeClass = (a: QcAnswer) => (a === 'YES' ? 'good' : a === 'NO' ? 'bad' : 'na');

export function CallQA() {
  const { role } = useRole();
  const editable = can.callQa(role);
  const toast = useToast();
  const confirm = useConfirm();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [params, setParams] = useState<QcParameters | null>(null);
  const [periods, setPeriods] = useState<string[]>([]);
  const [period, setPeriod] = useState<string>('');
  const [view, setView] = useState<CallQaView | null>(null);
  const [filteredEvals, setFilteredEvals] = useState<CallEvaluation[]>([]);
  const [error, setError] = useState('');

  // Table filters
  const [filterProduct, setFilterProduct] = useState('');
  const [filterMember, setFilterMember] = useState('');
  const [filterResult, setFilterResult] = useState<'' | 'pass' | 'fail' | 'critical'>('');
  const [filterEscalation, setFilterEscalation] = useState(false);
  const [insightsOpen, setInsightsOpen] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [header, setHeader] = useState(emptyHeader());
  const [answers, setAnswers] = useState<AnswerState>({});
  const [saving, setSaving] = useState(false);
  const [viewing, setViewing] = useState<CallEvaluation | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const allParams = useMemo(() => (params ? [...params.call, ...params.case] : []), [params]);
  const target = view?.target ?? 95;

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
    api.get<QcParameters>('/call-qa/parameters').then((r) => setParams(r.data));
    api.get<string[]>('/call-qa/periods').then((r) => setPeriods(r.data));
    load();
  }, []);

  // --- live preview of the score panel ---
  const preview = useMemo(() => {
    if (!params) {
      return { call: sectionStats([], {}), case: sectionStats([], {}), overall: null as number | null, answered: 0, total: 0 };
    }
    const call = sectionStats(params.call, answers);
    const kase = sectionStats(params.case, answers);
    const yes = call.yes + kase.yes;
    const applicable = call.applicable + kase.applicable;
    const overall = applicable === 0 ? null : Math.round((yes / applicable) * 1000) / 10;
    const answered = allParams.filter((p) => answers[p.id]?.answer).length;
    return { call, case: kase, overall, answered, total: allParams.length };
  }, [params, answers, allParams]);

  const criticalFail = allParams.some((p) => p.critical && answers[p.id]?.answer === 'NO');
  const passedPreview = !criticalFail && preview.overall !== null && preview.overall >= target;

  // --- client-side table filters ---
  const productOptions = useMemo(
    () => [...new Set((view?.evaluations ?? []).map((e) => e.product || '—'))].sort(),
    [view]
  );
  const memberOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of view?.evaluations ?? []) {
      map.set(e.callHandledById, e.callHandledBy.name);
      map.set(e.caseOwnerId, e.caseOwner.name);
    }
    return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [view]);

  const tableRows = useMemo(() => {
    return (view?.evaluations ?? []).filter((e) => {
      if (filterProduct && (e.product || '—') !== filterProduct) return false;
      if (filterMember && e.callHandledById !== filterMember && e.caseOwnerId !== filterMember) return false;
      if (filterResult === 'pass' && !e.passed) return false;
      if (filterResult === 'fail' && e.passed) return false;
      if (filterResult === 'critical' && !e.criticalFailed) return false;
      if (filterEscalation && !e.customerEscalation) return false;
      return true;
    });
  }, [view, filterProduct, filterMember, filterResult, filterEscalation]);

  // --- insights ---
  const insights = useMemo(() => {
    const evals = view?.evaluations ?? [];
    const total = evals.length;
    const passCount = evals.filter((e) => e.passed).length;
    const criticalCount = evals.filter((e) => e.criticalFailed).length;
    const avg = (arr: (number | null)[]) => {
      const v = arr.filter((x): x is number => x !== null);
      return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100 : null;
    };
    const prodMap = new Map<string, { sum: number; n: number; count: number }>();
    for (const e of evals) {
      const key = e.product || '—';
      const g = prodMap.get(key) ?? { sum: 0, n: 0, count: 0 };
      g.count++;
      if (e.overallAdherence !== null) {
        g.sum += e.overallAdherence;
        g.n++;
      }
      prodMap.set(key, g);
    }
    const perProduct = [...prodMap.entries()]
      .map(([product, g]) => ({ product, avg: g.n ? Math.round((g.sum / g.n) * 100) / 100 : null, count: g.count }))
      .sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1));
    const weakest = [...(view?.perParameter ?? [])].filter((p) => p.applicable > 0).sort((a, b) => a.avg - b.avg).slice(0, 5);
    return {
      total,
      passCount,
      failCount: total - passCount,
      criticalCount,
      callAvg: avg(evals.map((e) => e.callAdherence)),
      caseAvg: avg(evals.map((e) => e.caseAdherence)),
      perProduct,
      weakest,
    };
  }, [view]);

  // --- modal helpers ---
  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
  };
  const buildAnswerState = (ev?: CallEvaluation): AnswerState => {
    const init: AnswerState = {};
    for (const p of allParams) init[p.id] = { answer: '', comment: '' };
    if (ev) for (const a of ev.answers) init[a.parameterId] = { answer: a.answer, comment: a.comment ?? '' };
    return init;
  };

  const openNew = () => {
    setEditingId(null);
    setHeader(emptyHeader());
    setAnswers(buildAnswerState());
    setModalOpen(true);
  };

  const openEdit = (ev: CallEvaluation) => {
    setEditingId(ev.id);
    setHeader({
      product: ev.product ?? '',
      caseNo: ev.caseNo,
      callDateTime: ev.callDateTime ? ev.callDateTime.slice(0, 16) : nowLocal(),
      ticketCreatedDateTime: ev.ticketCreatedDateTime ? ev.ticketCreatedDateTime.slice(0, 16) : '',
      userName: ev.userName ?? '',
      callHandledById: ev.callHandledById,
      caseOwnerId: ev.caseOwnerId,
      analystId: ev.analystId ?? '',
      customerEscalation: ev.customerEscalation,
      findings: ev.findings ?? '',
      actionPlan: ev.actionPlan ?? '',
    });
    setAnswers(buildAnswerState(ev));
    setModalOpen(true);
  };

  // Clone: copy answers + header into a NEW QC (blank case number, fresh date).
  const openClone = (ev: CallEvaluation) => {
    setEditingId(null);
    setHeader({
      product: ev.product ?? '',
      caseNo: '',
      callDateTime: nowLocal(),
      ticketCreatedDateTime: '',
      userName: ev.userName ?? '',
      callHandledById: ev.callHandledById,
      caseOwnerId: ev.caseOwnerId,
      analystId: ev.analystId ?? '',
      customerEscalation: ev.customerEscalation,
      findings: '',
      actionPlan: '',
    });
    setAnswers(buildAnswerState(ev));
    setModalOpen(true);
    toast.success('Cloned — enter a new case number and save.');
  };

  const setAnswer = (id: string, answer: QcAnswer) =>
    setAnswers((prev) => ({ ...prev, [id]: { answer, comment: prev[id]?.comment ?? '' } }));
  const setComment = (id: string, comment: string) =>
    setAnswers((prev) => ({ ...prev, [id]: { answer: prev[id]?.answer ?? '', comment } }));
  const markAll = (list: QcParameter[], answer: QcAnswer) =>
    setAnswers((prev) => {
      const next = { ...prev };
      for (const p of list) next[p.id] = { answer, comment: next[p.id]?.comment ?? '' };
      return next;
    });
  const clearSection = (list: QcParameter[]) =>
    setAnswers((prev) => {
      const next = { ...prev };
      for (const p of list) next[p.id] = { answer: '', comment: next[p.id]?.comment ?? '' };
      return next;
    });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!header.caseNo || !header.callHandledById || !header.caseOwnerId) {
      toast.error('Case number, call handler, and case owner are required.');
      return;
    }
    if (preview.answered < preview.total) {
      toast.error(`Answer all parameters (${preview.answered}/${preview.total}).`);
      return;
    }
    const payload = {
      ...header,
      ticketCreatedDateTime: header.ticketCreatedDateTime || null,
      analystId: header.analystId || null,
      answers: allParams.map((p) => ({
        parameterId: p.id,
        answer: answers[p.id].answer,
        comment: answers[p.id].comment || null,
      })),
    };
    setSaving(true);
    try {
      if (editingId) {
        await api.patch(`/call-qa/${editingId}`, payload);
        toast.success('QC updated.');
      } else {
        await api.post('/call-qa', payload);
        toast.success('QC saved.');
      }
      closeModal();
      const p = await api.get<string[]>('/call-qa/periods');
      setPeriods(p.data);
      load(header.callDateTime.slice(0, 7));
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (ev: CallEvaluation) => {
    const ok = await confirm({
      title: 'Delete QC',
      message: `Delete QC for case ${ev.caseNo}?`,
      danger: true,
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    try {
      await api.delete(`/call-qa/${ev.id}`);
      toast.success('QC deleted.');
      load(period);
    } catch (err) {
      toast.error(apiError(err));
    }
  };

  // Export the currently filtered rows of the QC evaluations table to Excel.
  const exportFiltered = async () => {
    if (!view?.period) return;
    const ids = filteredEvals.map((ev) => ev.id);
    try {
      const res = await api.get('/call-qa/export', {
        params: { period: view.period, ids: ids.join(',') },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `call-case-qc-${view.period}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(apiError(err));
    }
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
      const r = await api.post('/call-qa/upload', fd);
      const { inserted, errors, totalRows } = r.data;
      toast.success(`Imported ${inserted}/${totalRows} QC(s)${errors.length ? `, ${errors.length} error(s)` : ''}.`);
      if (fileRef.current) fileRef.current.value = '';
      const p = await api.get<string[]>('/call-qa/periods');
      setPeriods(p.data);
      load();
    } catch (err) {
      toast.error(apiError(err));
    }
  };

  const resetFilters = () => {
    setFilterProduct('');
    setFilterMember('');
    setFilterResult('');
    setFilterEscalation(false);
  };
  const filtersActive = filterProduct || filterMember || filterResult || filterEscalation;

  return (
    <div>
      <div className="page-head-row">
        <div>
          <h2 className="page-title">Call &amp; Case QC</h2>
          <p className="page-sub">
            Score each call and case against the QC parameters (Yes / No / NA). Pass target is {target}% overall adherence.
            Critical parameters auto-fail the QC.
          </p>
        </div>
        {editable && (
          <button className="btn" onClick={openNew} disabled={!params}>
            + New QC
          </button>
        )}
      </div>

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
        {view && (
          <span className="muted" style={{ fontSize: 13 }}>
            Avg adherence {view.averageScore}% · Pass rate {view.passRate}%
          </span>
        )}
        <button className="btn secondary sm" style={{ marginLeft: 'auto' }} onClick={() => setInsightsOpen((v) => !v)}>
          {insightsOpen ? 'Hide insights' : 'Show insights'}
        </button>
      </div>

      {error && <div className="notice error">{error}</div>}

      {insightsOpen && (
        <div className="card" style={{ marginBottom: 18 }}>
          <h3>Insights &amp; analytics</h3>
          <div className="score-panel" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
            <div className="stat">
              <span className="stat-label">Evaluations</span>
              <b className="mono">{insights.total}</b>
            </div>
            <div className="stat">
              <span className="stat-label">Passed</span>
              <b className="mono rag-good">{insights.passCount}</b>
            </div>
            <div className="stat">
              <span className="stat-label">Failed</span>
              <b className="mono rag-bad">{insights.failCount}</b>
            </div>
            <div className="stat">
              <span className="stat-label">Critical fails</span>
              <b className="mono rag-bad">{insights.criticalCount}</b>
            </div>
            <div className="stat">
              <span className="stat-label">Avg call %</span>
              <b className={`mono ${ragClass(insights.callAvg, target)}`}>{pct(insights.callAvg)}</b>
            </div>
            <div className="stat">
              <span className="stat-label">Avg case %</span>
              <b className={`mono ${ragClass(insights.caseAvg, target)}`}>{pct(insights.caseAvg)}</b>
            </div>
          </div>

          <div className="grid grid-3" style={{ marginTop: 6 }}>
            <div>
              <h4 className="mini-head">Adherence by product</h4>
              <ul className="list">
                {insights.perProduct.map((p) => (
                  <li key={p.product}>
                    <span>
                      {p.product} <span className="muted">({p.count})</span>
                    </span>
                    <b className={`mono ${ragClass(p.avg, target)}`}>{pct(p.avg)}</b>
                  </li>
                ))}
                {insights.perProduct.length === 0 && <li className="muted">No data.</li>}
              </ul>
            </div>
            <div>
              <h4 className="mini-head">Weakest parameters</h4>
              <ul className="list">
                {insights.weakest.map((p) => (
                  <li key={p.key}>
                    <span>
                      <span className="muted mono">{p.key}</span> {p.label}
                      {p.critical && <span className="badge bad" style={{ marginLeft: 6 }}>CRITICAL</span>}
                    </span>
                    <b className={`mono ${ragClass(p.avg, target)}`}>{pct(p.avg)}</b>
                  </li>
                ))}
                {insights.weakest.length === 0 && <li className="muted">No data.</li>}
              </ul>
            </div>
            <div>
              <h4 className="mini-head">Adherence by team member</h4>
              <ul className="list">
                {(view?.perAgent ?? []).map((a) => (
                  <li key={a.employeeId}>
                    <span>
                      {a.name} <span className="muted">({a.evaluations})</span>
                    </span>
                    <b className={`mono ${ragClass(a.avgScore, target)}`}>{pct(a.avgScore)}</b>
                  </li>
                ))}
                {(view?.perAgent ?? []).length === 0 && <li className="muted">No data.</li>}
              </ul>
            </div>
          </div>
        </div>
      )}

      {editable && (
        <div className="card no-print" style={{ marginBottom: 18 }}>
          <h3>Import from Excel</h3>
          <form onSubmit={onImport} style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" />
            <button className="btn" type="submit">
              Upload
            </button>
            <a className="btn secondary" href="/api/templates/call-qa">
              Download template
            </a>
            <span className="muted" style={{ fontSize: 13 }}>
              Columns: Product, Case No, Call Date, Call Handled By, Case Owner, then QC1…QC20 (Yes/No/NA).
            </span>
          </form>
        </div>
      )}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0 }}>QC evaluations — {period || '—'}</h3>
          <button
            className="btn secondary sm"
            onClick={exportFiltered}
            disabled={filteredEvals.length === 0}
            title="Export the filtered rows to Excel"
          >
            Export to Excel ({filteredEvals.length})
          </button>
        </div>

        {/* Filter bar */}
        <div className="filter-bar no-print">
          <select value={filterProduct} onChange={(e) => setFilterProduct(e.target.value)}>
            <option value="">All products</option>
            {productOptions.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <select value={filterMember} onChange={(e) => setFilterMember(e.target.value)}>
            <option value="">All team members</option>
            {memberOptions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <select value={filterResult} onChange={(e) => setFilterResult(e.target.value as typeof filterResult)}>
            <option value="">All results</option>
            <option value="pass">Pass only</option>
            <option value="fail">Fail only</option>
            <option value="critical">Critical fails</option>
          </select>
          <label className="check-inline">
            <input type="checkbox" checked={filterEscalation} onChange={(e) => setFilterEscalation(e.target.checked)} />
            Escalations only
          </label>
          {filtersActive && (
            <button className="btn secondary sm" onClick={resetFilters}>
              Clear filters
            </button>
          )}
        </div>

        <DataTable
          rows={tableRows}
          rowKey={(e) => e.id}
          emptyText="No QC evaluations match the current filters."
          onFilteredRowsChange={setFilteredEvals}
          columns={[
            { key: 'case', header: 'Case', value: (e) => e.caseNo },
            { key: 'product', header: 'Product', value: (e) => e.product ?? '—' },
            { key: 'handler', header: 'Call handled by', value: (e) => e.callHandledBy.name },
            { key: 'owner', header: 'Case owner', value: (e) => e.caseOwner.name },
            { key: 'call', header: 'Call %', align: 'right', value: (e) => e.callAdherence ?? -1, render: (e) => <span className={ragClass(e.callAdherence, target)}>{pct(e.callAdherence)}</span> },
            { key: 'cas', header: 'Case %', align: 'right', value: (e) => e.caseAdherence ?? -1, render: (e) => <span className={ragClass(e.caseAdherence, target)}>{pct(e.caseAdherence)}</span> },
            {
              key: 'overall',
              header: 'Overall %',
              align: 'right',
              value: (e) => e.overallAdherence ?? -1,
              render: (e) => <b className={ragClass(e.overallAdherence, target)}>{pct(e.overallAdherence)}</b>,
            },
            {
              key: 'result',
              header: 'Result',
              value: (e) => (e.criticalFailed ? 'Critical' : e.passed ? 'Pass' : 'Fail'),
              render: (e) => (
                <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                  <span className={`badge ${e.passed ? 'good' : 'bad'}`}>{e.passed ? 'PASS' : 'FAIL'}</span>
                  {e.criticalFailed && (
                    <span className="badge bad" title="A critical parameter failed">
                      CRIT
                    </span>
                  )}
                  {e.customerEscalation && (
                    <span className="badge warn" title="Customer/user escalation">
                      ESC
                    </span>
                  )}
                </span>
              ),
            },
          ]}
          actions={(e) => (
            <span className="row-actions">
              <button className="btn secondary icon" onClick={() => setViewing(e)}>
                View
              </button>
              {editable && (
                <>
                  <button className="btn secondary icon" onClick={() => openEdit(e)}>
                    Edit
                  </button>
                  <button className="btn secondary icon" onClick={() => openClone(e)}>
                    Clone
                  </button>
                  <button className="btn danger icon" onClick={() => remove(e)}>
                    Delete
                  </button>
                </>
              )}
            </span>
          )}
        />
      </div>

      {/* Create / edit modal */}
      {modalOpen && params && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal wide" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="modal-head-row">
              <h3 style={{ margin: 0 }}>{editingId ? 'Edit QC' : 'New QC'}</h3>
              <button className="btn secondary icon" onClick={closeModal} aria-label="Close">
                ✕
              </button>
            </div>

            <form onSubmit={submit}>
              <div className="row">
                <label className="field">
                  Product
                  <input value={header.product} onChange={(e) => setHeader({ ...header, product: e.target.value })} placeholder="VNA / PACS" />
                </label>
                <label className="field">
                  Case number *
                  <input value={header.caseNo} onChange={(e) => setHeader({ ...header, caseNo: e.target.value })} placeholder="12470153" />
                </label>
              </div>
              <div className="row">
                <label className="field">
                  Call date &amp; time (Five9)
                  <input type="datetime-local" value={header.callDateTime} onChange={(e) => setHeader({ ...header, callDateTime: e.target.value })} />
                </label>
                <label className="field">
                  Ticket created (Salesforce)
                  <input
                    type="datetime-local"
                    value={header.ticketCreatedDateTime}
                    onChange={(e) => setHeader({ ...header, ticketCreatedDateTime: e.target.value })}
                  />
                </label>
              </div>
              <div className="row">
                <label className="field">
                  Call handled by * <span className="muted">(call handling)</span>
                  <select value={header.callHandledById} onChange={(e) => setHeader({ ...header, callHandledById: e.target.value })}>
                    <option value="">Select…</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Case owner * <span className="muted">(case handling)</span>
                  <select value={header.caseOwnerId} onChange={(e) => setHeader({ ...header, caseOwnerId: e.target.value })}>
                    <option value="">Select…</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="row">
                <label className="field">
                  User name
                  <input value={header.userName} onChange={(e) => setHeader({ ...header, userName: e.target.value })} />
                </label>
                <label className="check-inline">
                  <input
                    type="checkbox"
                    checked={header.customerEscalation}
                    onChange={(e) => setHeader({ ...header, customerEscalation: e.target.checked })}
                  />
                  Customer / user escalation for the case?
                </label>
              </div>

              {/* Live score panel */}
              <div className="score-panel">
                <div className="stat">
                  <span className="stat-label">Call handling</span>
                  <b className={`mono ${ragClass(preview.call.adherence, target)}`}>{pct(preview.call.adherence)}</b>
                  <span className="muted" style={{ fontSize: 11 }}>
                    {preview.call.yes}/{preview.call.applicable} Yes
                  </span>
                </div>
                <div className="stat">
                  <span className="stat-label">Case handling</span>
                  <b className={`mono ${ragClass(preview.case.adherence, target)}`}>{pct(preview.case.adherence)}</b>
                  <span className="muted" style={{ fontSize: 11 }}>
                    {preview.case.yes}/{preview.case.applicable} Yes
                  </span>
                </div>
                <div className="stat">
                  <span className="stat-label">Overall</span>
                  <b className={`mono ${ragClass(preview.overall, target)}`}>{pct(preview.overall)}</b>
                </div>
                <div className="stat">
                  <span className="stat-label">Result</span>
                  {preview.answered === preview.total ? (
                    <span className={`badge ${passedPreview ? 'good' : 'bad'}`}>{passedPreview ? 'PASS' : 'FAIL'}</span>
                  ) : (
                    <span className="muted mono">
                      {preview.answered}/{preview.total}
                    </span>
                  )}
                </div>
              </div>
              {criticalFail && (
                <div className="notice error" style={{ marginTop: 10, marginBottom: 0 }}>
                  A <b>critical</b> parameter is marked “No” — this QC will auto-fail regardless of the overall score.
                </div>
              )}

              {[
                { title: 'Call Handling Parameters', list: params.call },
                { title: 'Case Handling Parameters', list: params.case },
              ].map((sec) => (
                <div key={sec.title} className="qc-section">
                  <div className="qc-section-head">
                    <h4>{sec.title}</h4>
                    <span style={{ display: 'flex', gap: 6 }}>
                      <button type="button" className="btn secondary sm" onClick={() => markAll(sec.list, 'YES')}>
                        All Yes
                      </button>
                      <button type="button" className="btn secondary sm" onClick={() => markAll(sec.list, 'NA')}>
                        All NA
                      </button>
                      <button type="button" className="btn secondary sm" onClick={() => clearSection(sec.list)}>
                        Clear
                      </button>
                    </span>
                  </div>
                  {sec.list.map((p) => (
                    <div key={p.id} className="qc-row">
                      <div className="qc-text">
                        <span className="muted mono">{p.code}</span> {p.text}
                        {p.critical && <span className="badge bad" style={{ marginLeft: 6 }}>CRITICAL</span>}
                      </div>
                      <div className="seg" role="group" aria-label={p.text}>
                        {ANSWERS.map((a) => (
                          <button
                            key={a}
                            type="button"
                            className={`seg-btn ${a.toLowerCase()} ${answers[p.id]?.answer === a ? 'active' : ''}`}
                            onClick={() => setAnswer(p.id, a)}
                          >
                            {ANSWER_LABEL[a]}
                          </button>
                        ))}
                      </div>
                      <input
                        className="qc-comment"
                        placeholder="Comment"
                        value={answers[p.id]?.comment ?? ''}
                        onChange={(e) => setComment(p.id, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              ))}

              <div className="row" style={{ marginTop: 14 }}>
                <label className="field">
                  Findings
                  <textarea rows={2} value={header.findings} onChange={(e) => setHeader({ ...header, findings: e.target.value })} />
                </label>
                <label className="field">
                  Action plan
                  <textarea rows={2} value={header.actionPlan} onChange={(e) => setHeader({ ...header, actionPlan: e.target.value })} />
                </label>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn secondary" onClick={closeModal}>
                  Cancel
                </button>
                <button className="btn" type="submit" disabled={saving || preview.answered < preview.total}>
                  {saving ? 'Saving…' : editingId ? 'Update QC' : 'Save QC'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Read-only detail modal */}
      {viewing && (
        <div className="modal-overlay" onClick={() => setViewing(null)}>
          <div className="modal wide" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="modal-head-row">
              <h3 style={{ margin: 0 }}>
                QC · Case {viewing.caseNo}{' '}
                <span className={`badge ${viewing.passed ? 'good' : 'bad'}`}>{viewing.passed ? 'PASS' : 'FAIL'}</span>
                {viewing.criticalFailed && <span className="badge bad" style={{ marginLeft: 6 }}>CRITICAL FAIL</span>}
              </h3>
              <button className="btn secondary icon" onClick={() => setViewing(null)} aria-label="Close">
                ✕
              </button>
            </div>

            <div className="detail-grid">
              <div><span className="stat-label">Product</span> {viewing.product ?? '—'}</div>
              <div><span className="stat-label">Call handled by</span> {viewing.callHandledBy.name}</div>
              <div><span className="stat-label">Case owner</span> {viewing.caseOwner.name}</div>
              <div><span className="stat-label">Analyst</span> {viewing.analyst?.name ?? '—'}</div>
              <div><span className="stat-label">User</span> {viewing.userName ?? '—'}</div>
              <div><span className="stat-label">Escalation</span> {viewing.customerEscalation ? 'Yes' : 'No'}</div>
              <div><span className="stat-label">Call date</span> {viewing.callDateTime ? viewing.callDateTime.slice(0, 16).replace('T', ' ') : '—'}</div>
              <div><span className="stat-label">Ticket created</span> {viewing.ticketCreatedDateTime ? viewing.ticketCreatedDateTime.slice(0, 16).replace('T', ' ') : '—'}</div>
            </div>

            <div className="score-panel">
              <div className="stat">
                <span className="stat-label">Call handling</span>
                <b className={`mono ${ragClass(viewing.callAdherence, target)}`}>{pct(viewing.callAdherence)}</b>
                <span className="muted" style={{ fontSize: 11 }}>{viewing.callScore}/{viewing.callMax} pts</span>
              </div>
              <div className="stat">
                <span className="stat-label">Case handling</span>
                <b className={`mono ${ragClass(viewing.caseAdherence, target)}`}>{pct(viewing.caseAdherence)}</b>
                <span className="muted" style={{ fontSize: 11 }}>{viewing.caseScore}/{viewing.caseMax} pts</span>
              </div>
              <div className="stat">
                <span className="stat-label">Overall</span>
                <b className={`mono ${ragClass(viewing.overallAdherence, target)}`}>{pct(viewing.overallAdherence)}</b>
                <span className="muted" style={{ fontSize: 11 }}>target {viewing.target}%</span>
              </div>
              <div className="stat">
                <span className="stat-label">Result</span>
                <span className={`badge ${viewing.passed ? 'good' : 'bad'}`}>{viewing.passed ? 'PASS' : 'FAIL'}</span>
              </div>
            </div>

            {(['CALL', 'CASE'] as const).map((sectionKey) => {
              const list = viewing.answers.filter((a) => a.section === sectionKey);
              if (list.length === 0) return null;
              return (
                <div key={sectionKey} className="qc-section">
                  <div className="qc-section-head">
                    <h4>{sectionKey === 'CALL' ? 'Call Handling Parameters' : 'Case Handling Parameters'}</h4>
                  </div>
                  {list.map((a) => (
                    <div key={a.parameterId} className="qc-row view-row">
                      <div className="qc-text">
                        <span className="muted mono">{a.code}</span> {a.text}
                        {a.critical && <span className="badge bad" style={{ marginLeft: 6 }}>CRITICAL</span>}
                      </div>
                      <span className={`badge ${answerBadgeClass(a.answer)}`}>{ANSWER_LABEL[a.answer]}</span>
                      <div className="qc-text muted">{a.comment || ''}</div>
                    </div>
                  ))}
                </div>
              );
            })}

            {(viewing.findings || viewing.actionPlan) && (
              <div className="grid grid-2" style={{ marginTop: 12 }}>
                <div>
                  <h4 className="mini-head">Findings</h4>
                  <p className="muted" style={{ margin: 0 }}>{viewing.findings || '—'}</p>
                </div>
                <div>
                  <h4 className="mini-head">Action plan</h4>
                  <p className="muted" style={{ margin: 0 }}>{viewing.actionPlan || '—'}</p>
                </div>
              </div>
            )}

            <div className="modal-actions">
              {editable && (
                <button
                  className="btn secondary"
                  onClick={() => {
                    const ev = viewing;
                    setViewing(null);
                    openEdit(ev);
                  }}
                >
                  Edit
                </button>
              )}
              <button className="btn" onClick={() => setViewing(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
