import { useEffect, useState } from 'react';
import { api, apiError } from '../api';
import { useToast } from './Toast';
import type { NavSection } from '../types';

/** Admin UI to rename, reorder, and enable/disable navigation sections. */
export function SectionsManager() {
  const toast = useToast();
  const [sections, setSections] = useState<NavSection[]>([]);
  const [error, setError] = useState('');

  const load = () => api.get<NavSection[]>('/sections').then((r) => setSections(r.data)).catch((e) => setError(apiError(e)));
  useEffect(() => {
    load();
  }, []);

  const patch = async (id: string, data: Partial<NavSection>) => {
    try {
      await api.patch(`/sections/${id}`, data);
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const move = async (index: number, dir: -1 | 1) => {
    const next = [...sections];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setSections(next);
    try {
      await api.post('/sections/reorder', { orderedIds: next.map((s) => s.id) });
    } catch (e) {
      toast.error(apiError(e));
      load();
    }
  };

  return (
    <div className="card">
      <h3>Sections &amp; navigation</h3>
      <p className="metric-sub">Rename, reorder, or hide sections. Changes apply to the sidebar for everyone.</p>
      {error && <div className="notice error">{error}</div>}
      <ul className="list">
        {sections.map((s, i) => (
          <li key={s.id} style={{ gap: 10 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
              <span className="reorder-btns">
                <button className="btn secondary icon" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                  ↑
                </button>
                <button
                  className="btn secondary icon"
                  disabled={i === sections.length - 1}
                  onClick={() => move(i, 1)}
                  aria-label="Move down"
                >
                  ↓
                </button>
              </span>
              <input
                defaultValue={s.label}
                onBlur={(e) => e.target.value.trim() && e.target.value !== s.label && patch(s.id, { label: e.target.value.trim() })}
                style={{ flex: 1, minWidth: 0, padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}
              />
              {s.adminOnly && <span className="badge top">ADMIN</span>}
              <span className="muted mono" style={{ fontSize: 11 }}>{s.path}</span>
            </span>
            <label className="check-inline" style={{ fontSize: 12 }}>
              <input type="checkbox" checked={s.enabled} onChange={(e) => patch(s.id, { enabled: e.target.checked })} />
              Enabled
            </label>
          </li>
        ))}
        {sections.length === 0 && <li className="muted">No sections.</li>}
      </ul>
    </div>
  );
}
