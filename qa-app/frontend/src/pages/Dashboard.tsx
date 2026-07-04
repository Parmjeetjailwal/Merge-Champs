import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, ClipboardCheck, PhoneCall, GraduationCap, Wrench, Bell, TrendingUp } from 'lucide-react';
import { api, apiError } from '../api';
import { TrendChart } from '../ui/TrendChart';
import type { DashboardData, TrendPoint } from '../types';

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function Delta({ value, unit = '' }: { value: number; unit?: string }) {
  if (!value) return <span className="muted" style={{ fontSize: 12 }}>±0{unit}</span>;
  const up = value > 0;
  return (
    <span className="badge" style={{ background: up ? 'var(--good-bg)' : 'var(--bad-bg)', color: up ? 'var(--good)' : 'var(--bad)' }}>
      {up ? '▲' : '▼'} {Math.abs(value)}
      {unit}
    </span>
  );
}

export function Dashboard() {
  const [period, setPeriod] = useState<string>(currentMonth());
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');
  const [qaTrend, setQaTrend] = useState<TrendPoint[]>([]);
  const [callTrend, setCallTrend] = useState<TrendPoint[]>([]);
  const [utilTrend, setUtilTrend] = useState<TrendPoint[]>([]);

  useEffect(() => {
    setError('');
    api
      .get<DashboardData>('/dashboard', { params: { period } })
      .then((r) => setData(r.data))
      .catch((e) => setError(apiError(e)));
  }, [period]);

  useEffect(() => {
    api.get<TrendPoint[]>('/qa-scores/trend').then((r) => setQaTrend(r.data)).catch(() => {});
    api.get<TrendPoint[]>('/call-qa/trend').then((r) => setCallTrend(r.data)).catch(() => {});
    api.get<TrendPoint[]>('/time-utilization/trend').then((r) => setUtilTrend(r.data)).catch(() => {});
  }, []);

  const noAlerts = (a: DashboardData['alerts']) =>
    a.belowTarget.employees.length === 0 && a.overdueKT.length === 0 && a.repeatMissers.length === 0 && a.callBreaches === 0;

  return (
    <div>
      <h2 className="page-title">Dashboard</h2>
      <p className="page-sub">Team quality &amp; productivity for {period}. Deltas compare to the previous period.</p>

      <div className="toolbar">
        <label className="muted">Period&nbsp;</label>
        <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
      </div>

      {error && <div className="notice error">{error}</div>}
      {!data && !error && <p className="muted">Loading…</p>}

      {data && (
        <>
          <div className="grid grid-3">
            {/* Time Utilization */}
            <div className="card">
              <div className="card-head">
                <span className="chip sky">
                  <Clock size={18} />
                </span>
                <h3>Time Utilization</h3>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <div className="metric">{data.timeUtilization.averageUtilization}%</div>
                <Delta value={data.deltas.utilization} unit="%" />
              </div>
              <p className="metric-sub">Avg utilization · target {data.timeUtilization.target}%</p>
              <ul className="list">
                {data.timeUtilization.top.map((r) => (
                  <li key={r.id}>
                    <span>
                      <span className="badge top">TOP</span> {r.employee.name}
                    </span>
                    <b className="mono">{r.utilizationPercent}%</b>
                  </li>
                ))}
                {data.timeUtilization.bottom.map((r) => (
                  <li key={r.id}>
                    <span>
                      <span className="badge warn">LOW</span> {r.employee.name}
                    </span>
                    <b className="mono">{r.utilizationPercent}%</b>
                  </li>
                ))}
                {data.timeUtilization.count === 0 && <li className="muted">No data for this period.</li>}
              </ul>
              <Link className="link" to="/time-utilization">
                View details →
              </Link>
            </div>

            {/* QA Score Summary */}
            <div className="card">
              <div className="card-head">
                <span className="chip indigo">
                  <ClipboardCheck size={18} />
                </span>
                <h3>QA Score Summary</h3>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <div className="metric">{data.qa.averageScore}</div>
                <Delta value={data.deltas.qa} />
              </div>
              <p className="metric-sub">Average QA score across team</p>
              <ul className="list">
                {data.qa.members.slice(0, 5).map((m) => (
                  <li key={m.employeeId}>
                    <span>{m.name}</span>
                    <b className="mono">{m.avgTotalScore}</b>
                  </li>
                ))}
                {data.qa.members.length === 0 && <li className="muted">No scores yet.</li>}
              </ul>
              <Link className="link" to="/qa-scores">
                Generate report →
              </Link>
            </div>

            {/* Call QA */}
            <div className="card">
              <div className="card-head">
                <span className="chip green">
                  <PhoneCall size={18} />
                </span>
                <h3>Call QA</h3>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <div className="metric">{data.callQa.averageScore}</div>
                <Delta value={data.deltas.callQa} />
              </div>
              <p className="metric-sub">Average call quality score</p>
              {data.callQa.topImprovementArea ? (
                <p>
                  Top improvement area: <span className="badge warn">{data.callQa.topImprovementArea.label}</span>{' '}
                  <span className="muted">(avg {data.callQa.topImprovementArea.avg})</span>
                </p>
              ) : (
                <p className="muted">No evaluations yet.</p>
              )}
              <Link className="link" to="/call-qa">
                View details →
              </Link>
            </div>

            {/* New Joinee KT */}
            <div className="card">
              <div className="card-head">
                <span className="chip violet">
                  <GraduationCap size={18} />
                </span>
                <h3>New Joinee KT Tracker</h3>
              </div>
              <ul className="list">
                {data.kt.joinees.map((j) => (
                  <li key={j.id} style={{ display: 'block' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>{j.name}</span>
                      <span className="muted mono">
                        {j.completed}/{j.total}
                      </span>
                    </div>
                    <div className="progress" style={{ marginTop: 6 }}>
                      <span style={{ width: `${j.percent}%` }} />
                    </div>
                  </li>
                ))}
                {data.kt.joinees.length === 0 && <li className="muted">No joinees tracked.</li>}
              </ul>
              <Link className="link" to="/kt">
                View details →
              </Link>
            </div>

            {/* Maintenance */}
            <div className="card">
              <div className="card-head">
                <span className="chip amber">
                  <Wrench size={18} />
                </span>
                <h3>Maintenance Activity</h3>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <div className="metric">{data.maintenance.onTimePercent}%</div>
                <Delta value={data.deltas.maintenanceOnTime} unit="%" />
              </div>
              <p className="metric-sub">On-time this period</p>
              {data.maintenance.topMaintainer ? (
                <p>
                  Top maintainer: <span className="badge top">{data.maintenance.topMaintainer.name}</span>{' '}
                  <span className="muted">({data.maintenance.topMaintainer.count})</span>
                </p>
              ) : (
                <p className="muted">No activities this period.</p>
              )}
              <Link className="link" to="/maintenance">
                View details →
              </Link>
            </div>

            {/* Alerts */}
            <div className="card">
              <div className="card-head">
                <span className="chip red">
                  <Bell size={18} />
                </span>
                <h3>Alerts</h3>
              </div>
              <ul className="list">
                {data.alerts.belowTarget.employees.map((e) => (
                  <li key={e.name}>
                    <span>
                      <span className="badge warn">BELOW TARGET</span> {e.name}
                    </span>
                    <b className="mono">{e.utilizationPercent}%</b>
                  </li>
                ))}
                {data.alerts.overdueKT.map((o, i) => (
                  <li key={`kt${i}`}>
                    <span>
                      <span className="badge bad">OVERDUE KT</span> {o.joinee}
                    </span>
                    <span className="muted">{o.topic}</span>
                  </li>
                ))}
                {data.alerts.repeatMissers.map((m) => (
                  <li key={m.employeeId}>
                    <span>
                      <span className="badge bad">REPEAT MISS</span> {m.name}
                    </span>
                    <b className="mono">{m.exceededCount}</b>
                  </li>
                ))}
                {data.alerts.callBreaches > 0 && (
                  <li>
                    <span>
                      <span className="badge bad">CALL BREACHES</span> time thresholds
                    </span>
                    <b className="mono">{data.alerts.callBreaches}</b>
                  </li>
                )}
                {noAlerts(data.alerts) && <li className="muted">No alerts. All clear.</li>}
              </ul>
            </div>
          </div>

          <div className="grid grid-3" style={{ marginTop: 18 }}>
            <div className="card">
              <div className="card-head">
                <span className="chip indigo">
                  <TrendingUp size={18} />
                </span>
                <h3>QA score trend</h3>
              </div>
              <TrendChart data={qaTrend} color="#2563eb" />
            </div>
            <div className="card">
              <div className="card-head">
                <span className="chip green">
                  <TrendingUp size={18} />
                </span>
                <h3>Call QA trend</h3>
              </div>
              <TrendChart data={callTrend} color="#16a34a" />
            </div>
            <div className="card">
              <div className="card-head">
                <span className="chip amber">
                  <TrendingUp size={18} />
                </span>
                <h3>Utilization trend</h3>
              </div>
              <TrendChart data={utilTrend} color="#d97706" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
