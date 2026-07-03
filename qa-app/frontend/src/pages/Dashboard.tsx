import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, apiError } from '../api';
import type { DashboardData } from '../types';

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function Dashboard() {
  const [period, setPeriod] = useState<string>(currentMonth());
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
    api
      .get<DashboardData>('/dashboard', { params: { period } })
      .then((r) => setData(r.data))
      .catch((e) => setError(apiError(e)));
  }, [period]);

  return (
    <div>
      <h2 className="page-title">Dashboard</h2>
      <p className="page-sub">Team quality &amp; productivity overview for {period}.</p>

      <div className="toolbar">
        <label className="muted">Period&nbsp;</label>
        <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
      </div>

      {error && <div className="notice error">{error}</div>}
      {!data && !error && <p className="muted">Loading…</p>}

      {data && (
        <div className="grid grid-3">
          {/* Time Utilization */}
          <div className="card">
            <h3>Time Utilization</h3>
            <p className="metric-sub">Top 2 &amp; bottom 2 by utilization</p>
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
            <h3>QA Score Summary</h3>
            <div className="metric">{data.qa.averageScore}</div>
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
            <h3>Call QA</h3>
            <div className="metric">{data.callQa.averageScore}</div>
            <p className="metric-sub">Average call quality score</p>
            {data.callQa.topImprovementArea ? (
              <p>
                Top improvement area:{' '}
                <span className="badge warn">{data.callQa.topImprovementArea.label}</span>{' '}
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
            <h3>New Joinee KT Tracker</h3>
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
            <h3>Maintenance Activity</h3>
            {data.maintenance.topMaintainer ? (
              <p>
                Top maintainer:{' '}
                <span className="badge top">{data.maintenance.topMaintainer.name}</span>{' '}
                <span className="muted">({data.maintenance.topMaintainer.count} activities)</span>
              </p>
            ) : (
              <p className="muted">No activities this period.</p>
            )}
            <p className="metric-sub">Missed timelines</p>
            <ul className="list">
              {data.maintenance.missedTimeline.map((m) => (
                <li key={m.employeeId}>
                  <span>
                    <span className="badge bad">MISSED</span> {m.name}
                  </span>
                  <b className="mono">{m.exceededCount}</b>
                </li>
              ))}
              {data.maintenance.missedTimeline.length === 0 && <li className="muted">Everyone on time.</li>}
            </ul>
            <Link className="link" to="/maintenance">
              View details →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
