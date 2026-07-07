import { useEffect, useRef, useState } from 'react';
import { api, apiError } from '../api';
import { useRole } from '../RoleContext';
import { useAuth } from '../AuthContext';
import { can } from '../perms';
import { useToast } from '../ui/Toast';
import { useConfirm } from '../ui/Confirm';
import { exportCsv } from '../lib/exportCsv';
import type { AccessStatus, Employee, Joinee, JoineeAccess, KTTemplate, KTTopic, Project } from '../types';

export function KTTracker() {
  const { role } = useRole();
  const { user } = useAuth();
  const editable = can.kt(role);
  const toast = useToast();
  const confirm = useConfirm();
  const [joinees, setJoinees] = useState<Joinee[]>([]);
  const [templates, setTemplates] = useState<KTTemplate[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [applyChoice, setApplyChoice] = useState<Record<string, string>>({});
  const [accessChoice, setAccessChoice] = useState<Record<string, string>>({});
  const [previewProject, setPreviewProject] = useState('');
  const [accessOwner, setAccessOwner] = useState('');
  const [pendingOnly, setPendingOnly] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', joinDate: '', team: '', mentor: '', topics: '' });
  const [newTopic, setNewTopic] = useState<Record<string, string>>({});
  const [selectedJoineeId, setSelectedJoineeId] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => {
    api
      .get<Joinee[]>('/kt/joinees')
      .then((r) => {
        setJoinees(r.data);
        setSelectedJoineeId((cur) => (cur && r.data.some((j) => j.id === cur) ? cur : r.data[0]?.id ?? ''));
      })
      .catch((e) => setError(apiError(e)));
  };
  useEffect(load, []);
  useEffect(() => {
    api.get<KTTemplate[]>('/kt/templates').then((r) => setTemplates(r.data)).catch(() => {});
    api.get<Project[]>('/kt/projects').then((r) => setProjects(r.data)).catch(() => {});
    api.get<Employee[]>('/employees').then((r) => setEmployees(r.data)).catch(() => {});
  }, []);

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
      const r = await api.post('/kt/upload', fd);
      const { joineesCreated, topicsAdded, errors } = r.data;
      toast.success(`Imported ${joineesCreated} joinee(s), ${topicsAdded} topic(s)${errors.length ? `, ${errors.length} error(s)` : ''}.`);
      if (fileRef.current) fileRef.current.value = '';
      load();
    } catch (err) {
      toast.error(apiError(err));
    }
  };

  const addJoinee = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.name) {
      setError('Name is required.');
      return;
    }
    try {
      await api.post('/kt/joinees', {
        name: form.name,
        joinDate: form.joinDate || undefined,
        team: form.team || undefined,
        mentor: form.mentor || undefined,
        topics: form.topics
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      });
      setForm({ name: '', joinDate: '', team: '', mentor: '', topics: '' });
      toast.success('Joinee added.');
      load();
    } catch (err) {
      const msg = apiError(err);
      setError(msg);
      toast.error(msg);
    }
  };

  const toggle = async (topicId: string, status: 'Completed' | 'Pending') => {
    const next = status === 'Completed' ? 'Pending' : 'Completed';
    try {
      await api.patch(`/kt/topics/${topicId}`, { status: next });
      load();
    } catch (err) {
      toast.error(apiError(err));
    }
  };

  const addTopic = async (joineeId: string) => {
    const topicName = (newTopic[joineeId] ?? '').trim();
    if (!topicName) return;
    try {
      await api.post(`/kt/joinees/${joineeId}/topics`, { topicName });
      setNewTopic({ ...newTopic, [joineeId]: '' });
      toast.success('Topic added.');
      load();
    } catch (err) {
      toast.error(apiError(err));
    }
  };

  const deleteTopic = async (topic: KTTopic) => {
    const ok = await confirm({ title: 'Delete topic', message: `Delete topic "${topic.topicName}"?`, danger: true, confirmLabel: 'Delete' });
    if (!ok) return;
    try {
      await api.delete(`/kt/topics/${topic.id}`);
      toast.success('Topic deleted.');
      load();
    } catch (err) {
      toast.error(apiError(err));
    }
  };

  const deleteJoinee = async (j: Joinee) => {
    const ok = await confirm({ title: 'Delete joinee', message: `Delete ${j.name} and all their KT topics?`, danger: true, confirmLabel: 'Delete' });
    if (!ok) return;
    try {
      await api.delete(`/kt/joinees/${j.id}`);
      toast.success('Joinee deleted.');
      load();
    } catch (err) {
      toast.error(apiError(err));
    }
  };

  const patchTopic = async (topicId: string, data: Record<string, unknown>, successMsg?: string) => {
    try {
      await api.patch(`/kt/topics/${topicId}`, data);
      if (successMsg) toast.success(successMsg);
      load();
    } catch (err) {
      toast.error(apiError(err));
    }
  };

  const applyTemplate = async (joineeId: string) => {
    const templateId = applyChoice[joineeId];
    if (!templateId) return;
    try {
      await api.post(`/kt/joinees/${joineeId}/apply-template`, { templateId });
      setApplyChoice({ ...applyChoice, [joineeId]: '' });
      toast.success('Template applied.');
      load();
    } catch (err) {
      toast.error(apiError(err));
    }
  };

  const applyAccessList = async (joineeId: string) => {
    const projectId = accessChoice[joineeId];
    if (!projectId) return;
    try {
      const r = await api.post(`/kt/joinees/${joineeId}/access/apply`, { projectId });
      setAccessChoice({ ...accessChoice, [joineeId]: '' });
      const added = (r.data as { added: number }).added;
      toast.success(added > 0 ? `Added ${added} access item(s).` : 'Access list already applied.');
      load();
    } catch (err) {
      toast.error(apiError(err));
    }
  };

  const patchAccess = async (id: string, data: Record<string, unknown>, successMsg?: string) => {
    try {
      await api.patch(`/kt/joinee-access/${id}`, data);
      if (successMsg) toast.success(successMsg);
      load();
    } catch (err) {
      toast.error(apiError(err));
    }
  };

  // Mark an access complete (Granted) or back to Pending, mirroring KT topic toggling.
  const setAccessStatus = (a: JoineeAccess, status: AccessStatus) => {
    const data: Record<string, unknown> = { status };
    // Attribute ownership on completion to the selected owner (or the current admin).
    if (status === 'Granted') data.requestedBy = accessOwner || a.requestedBy || user?.email || null;
    patchAccess(a.id, data);
  };

  const markAllAccessComplete = async (j: Joinee) => {
    const pending = (j.accesses ?? []).filter((a) => a.status !== 'Granted');
    if (pending.length === 0) return;
    const ok = await confirm({
      title: 'Mark all complete',
      message: `Mark all ${pending.length} outstanding access item(s) complete for ${j.name}?`,
      confirmLabel: 'Mark complete',
    });
    if (!ok) return;
    try {
      await Promise.all(
        pending.map((a) =>
          api.patch(`/kt/joinee-access/${a.id}`, {
            status: 'Granted',
            requestedBy: accessOwner || a.requestedBy || user?.email || null,
          })
        )
      );
      toast.success('All access items marked complete.');
      load();
    } catch (err) {
      toast.error(apiError(err));
    }
  };

  const deleteAccess = async (a: JoineeAccess) => {
    const ok = await confirm({
      title: 'Remove access',
      message: `Remove "${a.accessItem.name}" from this joinee?`,
      danger: true,
      confirmLabel: 'Remove',
    });
    if (!ok) return;
    try {
      await api.delete(`/kt/joinee-access/${a.id}`);
      toast.success('Access removed.');
      load();
    } catch (err) {
      toast.error(apiError(err));
    }
  };

  return (
    <div>
      <h2 className="page-title">KT OPS</h2>
      <p className="page-sub">Onboarding operations: knowledge transfer and project access provisioning for new joinees.</p>

      {error && <div className="notice error">{error}</div>}

      {projects.length > 0 && (
        <div className="card no-print" style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0 }}>Access lists</h3>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <label className="muted" style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                Owner
                <select
                  value={accessOwner}
                  onChange={(e) => setAccessOwner(e.target.value)}
                  style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 8 }}
                >
                  <option value="">All owners</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.name}>
                      {emp.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="muted" style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={pendingOnly} onChange={(e) => setPendingOnly(e.target.checked)} />
                Pending only
              </label>
              <label className="muted" style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                Project
                <select
                  value={previewProject}
                  onChange={(e) => setPreviewProject(e.target.value)}
                  style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 8 }}
                >
                  <option value="">Select a project…</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="btn secondary sm"
                onClick={() =>
                  exportCsv(
                    'kt-ops-access.csv',
                    joinees.flatMap((j) =>
                      (j.accesses ?? []).map((a) => ({
                        Joinee: j.name,
                        Project: a.accessItem.project.name,
                        Access: a.accessItem.name,
                        Status: a.status,
                        'Granted Date': a.grantedDate ? a.grantedDate.slice(0, 10) : '',
                        Owner: a.requestedBy ?? '',
                      }))
                    )
                  )
                }
              >
                Export CSV
              </button>
            </div>
          </div>
          {accessOwner &&
            (() => {
              const owned = joinees.flatMap((j) => (j.accesses ?? []).filter((a) => a.requestedBy === accessOwner));
              const complete = owned.filter((a) => a.status === 'Granted').length;
              const pending = owned.filter((a) => a.status === 'Pending').length;
              return (
                <p className="muted" style={{ marginTop: 10, marginBottom: 0, fontSize: 13 }}>
                  <strong>{accessOwner}</strong> — {pending} pending · {complete} complete
                  {owned.length === 0 && ' (no access items assigned yet)'}
                </p>
              );
            })()}
          {(() => {
            const proj = projects.find((p) => p.id === previewProject);
            if (!proj) {
              return <p className="muted" style={{ marginBottom: 0 }}>Choose a project to preview its standard access list.</p>;
            }
            return (
              <div style={{ marginTop: 10 }}>
                <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
                  {proj.name} standard accesses ({proj.accessItems.length}):
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {proj.accessItems.map((it) => (
                    <span key={it.id} className="badge" style={{ background: 'var(--surface-2)' }}>
                      {it.name}
                    </span>
                  ))}
                  {proj.accessItems.length === 0 && <span className="muted">No access items.</span>}
                </div>
                {editable && (
                  <AddAccessItem
                    projectId={proj.id}
                    onAdded={() =>
                      api
                        .get<Project[]>('/kt/projects')
                        .then((r) => setProjects(r.data))
                        .catch(() => {})
                    }
                    onError={(m) => toast.error(m)}
                    onSuccess={(m) => toast.success(m)}
                  />
                )}
              </div>
            );
          })()}
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
            <a className="btn secondary" href="/api/templates/kt">
              Download template
            </a>
            <span className="muted" style={{ fontSize: 13 }}>
              Columns: Joinee, Team, Mentor, Join Date, Topic, Status, Target Date (one row per topic)
            </span>
          </form>
        </div>
      )}

      {editable && (
        <div className="card no-print" style={{ marginBottom: 18 }}>
          <h3>Add joinee</h3>
          <form className="stack" onSubmit={addJoinee}>
            <div className="row">
              <label className="field">
                Name
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </label>
              <label className="field">
                Join date
                <input type="date" value={form.joinDate} onChange={(e) => setForm({ ...form, joinDate: e.target.value })} />
              </label>
            </div>
            <div className="row">
              <label className="field">
                Team
                <input value={form.team} onChange={(e) => setForm({ ...form, team: e.target.value })} />
              </label>
              <label className="field">
                Mentor
                <input value={form.mentor} onChange={(e) => setForm({ ...form, mentor: e.target.value })} />
              </label>
            </div>
            <label className="field">
              Topics (comma separated)
              <input
                value={form.topics}
                onChange={(e) => setForm({ ...form, topics: e.target.value })}
                placeholder="Codebase Overview, CI/CD, Release Process"
              />
            </label>
            <button className="btn" type="submit">
              Add joinee
            </button>
          </form>
        </div>
      )}

      <div className="card no-print" style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <label className="muted" style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
            Joiner
            <select
              value={selectedJoineeId}
              onChange={(e) => setSelectedJoineeId(e.target.value)}
              style={{ minWidth: 220, padding: '8px 10px', border: '1px solid var(--border-strong)', borderRadius: 8 }}
            >
              <option value="">Select a joiner…</option>
              {joinees.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.name}
                  {j.team ? ` · ${j.team}` : ''} — KT {j.progress.percent}%
                  {j.accessProgress.total > 0 ? ` · access ${j.accessProgress.granted}/${j.accessProgress.total}` : ''}
                </option>
              ))}
            </select>
          </label>
          <span className="muted" style={{ fontSize: 13 }}>{joinees.length} joiner{joinees.length === 1 ? '' : 's'} tracked</span>
        </div>
      </div>

      <div className="kt-joinees">
        {joinees.filter((j) => j.id === selectedJoineeId).map((j) => (
          <div className="card kt-card" key={j.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <div>
                <h3 style={{ margin: 0 }}>{j.name}</h3>
                <p className="metric-sub" style={{ margin: '2px 0 0' }}>
                  {j.team ?? '—'} · mentor: {j.mentor ?? '—'}
                </p>
              </div>
              <span className="muted mono" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {j.progress.overdue > 0 && <span className="badge bad">{j.progress.overdue} overdue</span>}
                {j.accessProgress.total > 0 && (
                  <span className={`badge ${j.accessProgress.percent === 100 ? 'good' : 'warn'}`}>
                    access {j.accessProgress.granted}/{j.accessProgress.total}
                  </span>
                )}
                {editable && (
                  <button className="btn danger icon no-print" onClick={() => deleteJoinee(j)}>
                    Delete
                  </button>
                )}
              </span>
            </div>

            <div className="kt-split">
              <section className="kt-col">
                <div className="kt-col-head">
                  <h4>Knowledge transfer</h4>
                  <span className="muted mono" style={{ fontSize: 12 }}>
                    {j.progress.completed}/{j.progress.total} ({j.progress.percent}%)
                  </span>
                </div>
                <div className="progress" style={{ marginBottom: 10 }}>
                  <span style={{ width: `${j.progress.percent}%` }} />
                </div>
                <ul className="list compact">
              {j.topics.map((t) => {
                const overdue = t.status === 'Pending' && !!t.targetDate && new Date(t.targetDate) < new Date();
                return (
                  <li key={t.id} style={{ display: 'block' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <span>
                        {t.status === 'Completed' ? (
                          <span className="badge good">DONE</span>
                        ) : (
                          <span className="badge warn">PENDING</span>
                        )}{' '}
                        {t.topicName}
                        {overdue && (
                          <span className="badge bad" style={{ marginLeft: 6 }}>
                            OVERDUE
                          </span>
                        )}
                        {t.signedOffBy && (
                          <span className="muted" style={{ fontSize: 12 }}>
                            {' '}
                            · signed off by {t.signedOffBy}
                          </span>
                        )}
                      </span>
                      {editable && (
                        <span className="row-actions">
                          <button className="btn secondary sm" onClick={() => toggle(t.id, t.status)}>
                            Mark {t.status === 'Completed' ? 'Pending' : 'Completed'}
                          </button>
                          <button
                            className="btn secondary sm"
                            onClick={() => patchTopic(t.id, { signedOffBy: user?.email ?? 'mentor' }, 'Signed off.')}
                          >
                            Sign off
                          </button>
                          <button className="btn danger icon" onClick={() => deleteTopic(t)}>
                            Remove
                          </button>
                        </span>
                      )}
                    </div>
                    {editable && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center' }}>
                        <label className="muted" style={{ fontSize: 12 }}>
                          Target{' '}
                          <input
                            type="date"
                            value={t.targetDate ? t.targetDate.slice(0, 10) : ''}
                            onChange={(e) => patchTopic(t.id, { targetDate: e.target.value || null })}
                          />
                        </label>
                        <input
                          placeholder="Notes…"
                          defaultValue={t.notes ?? ''}
                          onBlur={(e) => patchTopic(t.id, { notes: e.target.value })}
                          style={{ flex: 1, padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}
                        />
                      </div>
                    )}
                  </li>
                );
              })}
              {j.topics.length === 0 && <li className="muted">No topics yet.</li>}
            </ul>
            {editable && (
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <input
                  style={{ flex: 1, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8 }}
                  placeholder="Add topic…"
                  value={newTopic[j.id] ?? ''}
                  onChange={(e) => setNewTopic({ ...newTopic, [j.id]: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && addTopic(j.id)}
                />
                <button className="btn sm" onClick={() => addTopic(j.id)}>
                  Add
                </button>
              </div>
            )}
            {editable && templates.length > 0 && (
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <select
                  style={{ flex: 1, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8 }}
                  value={applyChoice[j.id] ?? ''}
                  onChange={(e) => setApplyChoice({ ...applyChoice, [j.id]: e.target.value })}
                >
                  <option value="">Apply template…</option>
                  {templates.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.name}
                    </option>
                  ))}
                </select>
                <button className="btn secondary sm" onClick={() => applyTemplate(j.id)}>
                  Apply
                </button>
              </div>
            )}
              </section>

              <section className="kt-col">
                <div className="kt-col-head">
                  <h4>Access list</h4>
                  <span className="muted mono" style={{ fontSize: 12 }}>
                    {j.accessProgress.total > 0
                      ? `${j.accessProgress.granted}/${j.accessProgress.total} complete${
                          j.accessProgress.pending > 0 ? ` · ${j.accessProgress.pending} pending` : ''
                        }`
                      : '—'}
                  </span>
                </div>
                {j.accessProgress.total > 0 && (
                  <div className="progress" style={{ marginBottom: 10 }}>
                    <span style={{ width: `${j.accessProgress.percent}%` }} />
                  </div>
                )}
                <ul className="list compact">
                  {(j.accesses ?? [])
                    .filter((a) => !pendingOnly || a.status !== 'Granted')
                    .map((a) => (
                      <li key={a.id} style={{ display: 'block' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                          <span>
                            {a.status === 'Granted' ? (
                              <span className="badge good">DONE</span>
                            ) : a.status === 'NA' ? (
                              <span className="badge">N/A</span>
                            ) : (
                              <span className="badge warn">PENDING</span>
                            )}{' '}
                            {a.accessItem.name}
                            <span className="muted" style={{ fontSize: 12 }}>
                              {' '}
                              · {a.accessItem.project.name}
                            </span>
                            {a.status === 'Granted' && a.grantedDate && (
                              <span className="muted" style={{ fontSize: 12 }}>
                                {' '}
                                · {a.grantedDate.slice(0, 10)}
                              </span>
                            )}
                            {a.requestedBy && (
                              <span className="muted" style={{ fontSize: 12 }}>
                                {' '}
                                · {a.requestedBy}
                              </span>
                            )}
                          </span>
                          {editable && (
                            <span className="row-actions">
                              <button
                                className="btn secondary sm"
                                onClick={() => setAccessStatus(a, a.status === 'Granted' ? 'Pending' : 'Granted')}
                              >
                                Mark {a.status === 'Granted' ? 'Pending' : 'Complete'}
                              </button>
                              <button
                                className="btn secondary sm"
                                onClick={() => setAccessStatus(a, a.status === 'NA' ? 'Pending' : 'NA')}
                              >
                                {a.status === 'NA' ? 'Reset' : 'N/A'}
                              </button>
                              <button className="btn danger icon" onClick={() => deleteAccess(a)}>
                                Remove
                              </button>
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                  {(j.accesses ?? []).length === 0 && <li className="muted">No access items yet.</li>}
                  {(j.accesses ?? []).length > 0 &&
                    pendingOnly &&
                    (j.accesses ?? []).every((a) => a.status === 'Granted') && (
                      <li className="muted">All access complete.</li>
                    )}
                </ul>
                {editable && projects.length > 0 && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                    <select
                      style={{ flex: 1, minWidth: 140, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8 }}
                      value={accessChoice[j.id] ?? ''}
                      onChange={(e) => setAccessChoice({ ...accessChoice, [j.id]: e.target.value })}
                    >
                      <option value="">Apply access list…</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <button className="btn secondary sm" onClick={() => applyAccessList(j.id)}>
                      Apply
                    </button>
                    {(j.accesses ?? []).some((a) => a.status !== 'Granted') && (
                      <button className="btn secondary sm" onClick={() => markAllAccessComplete(j)}>
                        Mark all complete
                      </button>
                    )}
                  </div>
                )}
              </section>
            </div>
          </div>
        ))}
        {joinees.length === 0 && <p className="muted">No joinees tracked yet.</p>}
        {joinees.length > 0 && !selectedJoineeId && <p className="muted">Select a joiner above to view their KT topics and access list.</p>}
      </div>
    </div>
  );
}

function AddAccessItem({
  projectId,
  onAdded,
  onError,
  onSuccess,
}: {
  projectId: string;
  onAdded: () => void;
  onError: (msg: string) => void;
  onSuccess: (msg: string) => void;
}) {
  const [name, setName] = useState('');
  const add = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      await api.post(`/kt/projects/${projectId}/access-items`, { name: trimmed });
      setName('');
      onSuccess('Access added to list.');
      onAdded();
    } catch (err) {
      onError(apiError(err));
    }
  };
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
      <input
        style={{ flex: 1, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8 }}
        placeholder="Add access to this list…"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && add()}
      />
      <button className="btn secondary sm" onClick={add}>
        Add
      </button>
    </div>
  );
}
