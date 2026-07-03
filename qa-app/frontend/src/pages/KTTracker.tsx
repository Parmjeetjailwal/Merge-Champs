import { useEffect, useState } from 'react';
import { api, apiError } from '../api';
import { useRole } from '../RoleContext';
import { can } from '../perms';
import type { Joinee } from '../types';

export function KTTracker() {
  const { role } = useRole();
  const editable = can.kt(role);
  const [joinees, setJoinees] = useState<Joinee[]>([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', joinDate: '', team: '', mentor: '', topics: '' });
  const [newTopic, setNewTopic] = useState<Record<string, string>>({});

  const load = () => {
    api.get<Joinee[]>('/kt/joinees').then((r) => setJoinees(r.data)).catch((e) => setError(apiError(e)));
  };
  useEffect(load, []);

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
      load();
    } catch (err) {
      setError(apiError(err));
    }
  };

  const toggle = async (topicId: string, status: 'Completed' | 'Pending') => {
    const next = status === 'Completed' ? 'Pending' : 'Completed';
    try {
      await api.patch(`/kt/topics/${topicId}`, { status: next });
      load();
    } catch (err) {
      setError(apiError(err));
    }
  };

  const addTopic = async (joineeId: string) => {
    const topicName = (newTopic[joineeId] ?? '').trim();
    if (!topicName) return;
    try {
      await api.post(`/kt/joinees/${joineeId}/topics`, { topicName });
      setNewTopic({ ...newTopic, [joineeId]: '' });
      load();
    } catch (err) {
      setError(apiError(err));
    }
  };

  return (
    <div>
      <h2 className="page-title">New Joinee KT Tracker</h2>
      <p className="page-sub">Track knowledge-transfer topics covered for each new joinee.</p>

      {error && <div className="notice error">{error}</div>}

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
              <span className="muted mono">
                {j.progress.completed}/{j.progress.total} ({j.progress.percent}%)
              </span>
            </div>
            <p className="metric-sub">
              {j.team ?? '—'} · mentor: {j.mentor ?? '—'}
            </p>
            <div className="progress" style={{ marginBottom: 12 }}>
              <span style={{ width: `${j.progress.percent}%` }} />
            </div>
            <ul className="list">
              {j.topics.map((t) => (
                <li key={t.id}>
                  <span>
                    {t.status === 'Completed' ? (
                      <span className="badge good">DONE</span>
                    ) : (
                      <span className="badge warn">PENDING</span>
                    )}{' '}
                    {t.topicName}
                  </span>
                  {editable && (
                    <button className="btn secondary sm" onClick={() => toggle(t.id, t.status)}>
                      Mark {t.status === 'Completed' ? 'Pending' : 'Completed'}
                    </button>
                  )}
                </li>
              ))}
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
          </div>
        ))}
        {joinees.length === 0 && <p className="muted">No joinees tracked yet.</p>}
      </div>
    </div>
  );
}
