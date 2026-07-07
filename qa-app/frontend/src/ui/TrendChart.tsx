import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import type { TrendPoint } from '../types';

interface TrendChartProps {
  data: TrendPoint[];
  color?: string;
  domainMax?: number;
  height?: number;
}

export function TrendChart({ data, color = '#2563eb', domainMax = 100, height = 180 }: TrendChartProps) {
  if (data.length === 0) return <p className="muted">Not enough history yet.</p>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: -20 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-strong)" />
        <XAxis dataKey="period" tick={{ fontSize: 11, fill: 'var(--muted)' }} stroke="var(--border-strong)" />
        <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} domain={[0, domainMax]} stroke="var(--border-strong)" />
        <Tooltip
          contentStyle={{ background: 'var(--panel)', border: '1px solid var(--border-strong)', borderRadius: 10, color: 'var(--text)' }}
          labelStyle={{ color: 'var(--text-soft)' }}
        />
        <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
