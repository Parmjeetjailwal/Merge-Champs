import { useEffect, useRef, useState } from 'react';
import { api, apiError } from '../api';
import { useRole } from '../RoleContext';
import { useAuth } from '../AuthContext';
import { can } from '../perms';
import { useToast } from '../ui/Toast';
import { useConfirm } from '../ui/Confirm';
import type { Joinee, KTTemplate, KTTopic } from '../types';

export function KTTracker() {
  const { role } = useRole();
  const { user } = useAuth();
  const editable = can.kt(role);
  const toast = useToast();
  const confirm = useConfirm();
  const [joinees, setJoinees] = useState<Joinee[]>([]);
  const [templates, setTemplates] = useState<KTTemplate[]>([]);
  const [applyChoice, setApplyChoice] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', joinDate: '', team: '', mentor: '', topics: '' });
  const [newTopic, setNewTopic] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => {
    api.get<Joinee[]>('/kt/joinees').then((r) => setJoinees(r.data)).catch((e) => setError(apiError(e)));
  };
  useEffect(load, []);
  useEffect(() => {
    api.get<KTTemplate[]>('/kt/templates').then((r) => setTemplates(r.data)).catch(() => {});
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

  return (
    <div>
      <h2 className="page-title">New Joinee KT Tracker</h2>
      <p className="page-sub">Track knowledge-transfer topics covered for each new joinee.</p>

      {error && <div className="notice error">{error}</div>}

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

      <div className="grid grid-2">
        {joinees.map((j) => (
          <div className="card" key={j.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <h3>{j.name}</h3>
              <span className="muted mono" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {j.progress.completed}/{j.progress.total} ({j.progress.percent}%)
                {j.progress.overdue > 0 && <span className="badge bad">{j.progress.overdue} overdue</span>}
                {editable && (
                  <button className="btn danger icon no-print" onClick={() => deleteJoinee(j)}>
                    Delete
                  </button>
                )}
              </span>
            </div>
            <p className="metric-sub">
              {j.team ?? '—'} · mentor: {j.mentor ?? '—'}
            </p>
            <div className="progress" style={{ marginBottom: 12 }}>
              <span style={{ width: `${j.progress.percent}%` }} />
            </div>
            <ul className="list">
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
          </div>
        ))}
        {joinees.length === 0 && <p className="muted">No joinees tracked yet.</p>}
      </div>
    </div>
  );
}
