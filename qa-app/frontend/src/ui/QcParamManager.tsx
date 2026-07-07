import { useEffect, useState } from 'react';
import { api, apiError } from '../api';
import { useToast } from './Toast';
import { useConfirm } from './Confirm';
import type { QcParameter, QcParameters } from '../types';

interface Props {
  section: 'CALL' | 'CASE';
  /** Scorecard endpoint used to fetch parameters, e.g. '/call-qa'. */
  endpoint: string;
  title: string;
  onClose: () => void;
  onChanged: () => void;
}

/** Admin modal to add, edit, reorder, activate and remove QC parameters for one section. */
export function QcParamManager({ section, endpoint, title, onClose, onChanged }: Props) {
  const toast = useToast();
  const confirm = useConfirm();
  const [params, setParams] = useState<QcParameter[]>([]);
  const [newText, setNewText] = useState('');
  const [newCritical, setNewCritical] = useState(false);

  const load = () =>
    api
      .get<QcParameters>(`${endpoint}/parameters`, { params: { includeInactive: 1 } })
      .then((r) => setParams(section === 'CALL' ? r.data.call : r.data.case))
      .catch((e) => toast.error(apiError(e)));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changed = () => {
    load();
    onChanged();
  };

  const add = async () => {
    const text = newText.trim();
    if (!text) return;
    try {
      await api.post('/qc-parameters', { section, text, critical: newCritical });
      setNewText('');
      setNewCritical(false);
      toast.success('Parameter added.');
      changed();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const patch = async (id: string, data: Partial<QcParameter>) => {
    try {
      await api.patch(`/qc-parameters/${id}`, data);
      changed();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const move = async (index: number, dir: -1 | 1) => {
    const next = [...params];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setParams(next);
    try {
      await api.post('/qc-parameters/reorder', { section, orderedIds: next.map((p) => p.id) });
      onChanged();
    } catch (e) {
      toast.error(apiError(e));
      load();
    }
  };

  const remove = async (p: QcParameter) => {
    const ok = await confirm({ title: 'Remove parameter', message: `Remove "${p.text}"? If it has history it will be deactivated instead.`, danger: true, confirmLabel: 'Remove' });
    if (!ok) return;
    try {
      await api.delete(`/qc-parameters/${p.id}`);
      toast.success('Parameter removed.');
      changed();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-head-row">
          <h3 style={{ margin: 0 }}>Manage {title}</h3>
          <button className="btn secondary icon" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="row" style={{ alignItems: 'flex-end' }}>
          <label className="field" style={{ flex: 1 }}>
            New parameter
            <input value={newText} onChange={(e) => setNewText(e.target.value)} placeholder="Question / check…" onKeyDown={(e) => e.key === 'Enter' && add()} />
          </label>
          <label className="check-inline" style={{ marginBottom: 8 }}>
            <input type="checkbox" checked={newCritical} onChange={(e) => setNewCritical(e.target.checked)} />
            Critical
          </label>
          <button className="btn" onClick={add} style={{ marginBottom: 4 }}>
            Add
          </button>
        </div>

        <ul className="list" style={{ marginTop: 6 }}>
          {params.map((p, i) => (
            <li key={p.id} style={{ display: 'block', opacity: p.active ? 1 : 0.55 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="reorder-btns">
                  <button className="btn secondary icon" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                    ↑
                  </button>
                  <button className="btn secondary icon" disabled={i === params.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
                    ↓
                  </button>
                </span>
                <span className="badge top" style={{ minWidth: 30, justifyContent: 'center' }}>#{p.serial ?? i + 1}</span>
                <input
                  defaultValue={p.text}
                  onBlur={(e) => e.target.value.trim() && e.target.value !== p.text && patch(p.id, { text: e.target.value.trim() })}
                  style={{ flex: 1, minWidth: 0, padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}
                />
                <label className="check-inline" style={{ fontSize: 12 }} title="Critical: a 'No' auto-fails the QC">
                  <input type="checkbox" checked={p.critical} onChange={(e) => patch(p.id, { critical: e.target.checked })} />
                  Crit
                </label>
                <label className="check-inline" style={{ fontSize: 12 }}>
                  <input type="checkbox" checked={p.active} onChange={(e) => patch(p.id, { active: e.target.checked })} />
                  Active
                </label>
                <button className="btn danger icon" onClick={() => remove(p)}>
                  ✕
                </button>
              </div>
            </li>
          ))}
          {params.length === 0 && <li className="muted">No parameters yet.</li>}
        </ul>

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
