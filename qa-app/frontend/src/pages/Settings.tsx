import { useEffect, useState } from 'react';
import { api, apiError } from '../api';
import { useToast } from '../ui/Toast';
import { SectionsManager } from '../ui/SectionsManager';
import type { AppConfig } from '../types';

export function Settings() {
  const toast = useToast();
  const [cfg, setCfg] = useState<AppConfig | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get<AppConfig>('/settings')
      .then((r) => setCfg(r.data))
      .catch((e) => setError(apiError(e)));
  }, []);

  const save = async () => {
    if (!cfg) return;
    try {
      const r = await api.put<AppConfig>('/settings', cfg);
      setCfg(r.data);
      toast.success('Settings saved.');
    } catch (err) {
      const m = apiError(err);
      setError(m);
      toast.error(m);
    }
  };

  if (!cfg) {
    return (
      <div>
        <h2 className="page-title">Settings</h2>
        {error && <div className="notice error">{error}</div>}
        <p className="muted">Loading…</p>
      </div>
    );
  }

  const n = (v: string) => Number(v);

  return (
    <div>
      <h2 className="page-title">Settings</h2>
      <p className="page-sub">Scoring weights, thresholds, and targets. Applied to new and edited evaluations and reports.</p>
      {error && <div className="notice error">{error}</div>}

      <div className="grid grid-2">
        <div className="card">
          <h3>Call QC</h3>
          <p className="metric-sub">Call-handling scorecard. Yes = full marks, No = zero, NA excluded. Pass when adherence ≥ target.</p>
          <label className="field">
            Pass target (% adherence)
            <input type="number" min={0} max={100} value={cfg.callQc.target}
              onChange={(e) => setCfg({ ...cfg, callQc: { ...cfg.callQc, target: n(e.target.value) } })} />
          </label>
          <label className="field">
            Points per &quot;Yes&quot;
            <input type="number" min={1} value={cfg.callQc.pointsPerYes}
              onChange={(e) => setCfg({ ...cfg, callQc: { ...cfg.callQc, pointsPerYes: n(e.target.value) } })} />
          </label>
        </div>

        <div className="card">
          <h3>Case QC</h3>
          <p className="metric-sub">Case-handling scorecard. Yes = full marks, No = zero, NA excluded. Pass when adherence ≥ target.</p>
          <label className="field">
            Pass target (% adherence)
            <input type="number" min={0} max={100} value={cfg.caseQc.target}
              onChange={(e) => setCfg({ ...cfg, caseQc: { ...cfg.caseQc, target: n(e.target.value) } })} />
          </label>
          <label className="field">
            Points per &quot;Yes&quot;
            <input type="number" min={1} value={cfg.caseQc.pointsPerYes}
              onChange={(e) => setCfg({ ...cfg, caseQc: { ...cfg.caseQc, pointsPerYes: n(e.target.value) } })} />
          </label>
        </div>

        <div className="card">
          <h3>Time utilization</h3>
          <label className="field">
            Target utilization %
            <input type="number" min={0} max={100} value={cfg.timeUtilization.targetPercent}
              onChange={(e) => setCfg({ ...cfg, timeUtilization: { targetPercent: n(e.target.value) } })} />
          </label>
        </div>

        <div className="card">
          <h3>PMI export</h3>
          <label className="check-inline">
            <input type="checkbox" checked={cfg.pmi.includeCallScores}
              onChange={(e) => setCfg({ ...cfg, pmi: { includeCallScores: e.target.checked } })} />
            Include call quality scores in the QA/PMI report
          </label>
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <button className="btn" onClick={save}>Save settings</button>
      </div>

      <div style={{ marginTop: 18 }}>
        <SectionsManager />
      </div>
    </div>
  );
}
