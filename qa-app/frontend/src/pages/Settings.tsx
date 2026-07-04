import { useEffect, useState } from 'react';
import { api, apiError } from '../api';
import { useToast } from '../ui/Toast';
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
          <h3>Jira QA weighting</h3>
          <p className="metric-sub">Timeliness + documentation should sum to 1.</p>
          <label className="field">
            Timeliness weight
            <input type="number" step={0.05} min={0} max={1} value={cfg.qa.timeliness}
              onChange={(e) => setCfg({ ...cfg, qa: { ...cfg.qa, timeliness: n(e.target.value) } })} />
          </label>
          <label className="field">
            Documentation weight
            <input type="number" step={0.05} min={0} max={1} value={cfg.qa.documentation}
              onChange={(e) => setCfg({ ...cfg, qa: { ...cfg.qa, documentation: n(e.target.value) } })} />
          </label>
          <label className="field">
            Scale max
            <input type="number" min={1} value={cfg.qa.scaleMax}
              onChange={(e) => setCfg({ ...cfg, qa: { ...cfg.qa, scaleMax: n(e.target.value) } })} />
          </label>
        </div>

        <div className="card">
          <h3>Call QA weighting & thresholds</h3>
          <div className="row">
            <label className="field">Opening
              <input type="number" step={0.05} value={cfg.callQa.opening}
                onChange={(e) => setCfg({ ...cfg, callQa: { ...cfg.callQa, opening: n(e.target.value) } })} /></label>
            <label className="field">Info captured
              <input type="number" step={0.05} value={cfg.callQa.info}
                onChange={(e) => setCfg({ ...cfg, callQa: { ...cfg.callQa, info: n(e.target.value) } })} /></label>
          </div>
          <div className="row">
            <label className="field">No dead air
              <input type="number" step={0.05} value={cfg.callQa.deadAir}
                onChange={(e) => setCfg({ ...cfg, callQa: { ...cfg.callQa, deadAir: n(e.target.value) } })} /></label>
            <label className="field">Closing
              <input type="number" step={0.05} value={cfg.callQa.closing}
                onChange={(e) => setCfg({ ...cfg, callQa: { ...cfg.callQa, closing: n(e.target.value) } })} /></label>
          </div>
          <div className="row">
            <label className="field">Case creation ≤ (s)
              <input type="number" value={cfg.callQa.caseCreationThresholdSecs}
                onChange={(e) => setCfg({ ...cfg, callQa: { ...cfg.callQa, caseCreationThresholdSecs: n(e.target.value) } })} /></label>
            <label className="field">Call close ≤ (s)
              <input type="number" value={cfg.callQa.callCloseThresholdSecs}
                onChange={(e) => setCfg({ ...cfg, callQa: { ...cfg.callQa, callCloseThresholdSecs: n(e.target.value) } })} /></label>
          </div>
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
          <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={cfg.pmi.includeCallScores}
              onChange={(e) => setCfg({ ...cfg, pmi: { includeCallScores: e.target.checked } })} />
            Include call quality scores in the QA/PMI report
          </label>
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <button className="btn" onClick={save}>Save settings</button>
      </div>
    </div>
  );
}
