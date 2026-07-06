import path from 'node:path';
import fs from 'node:fs';
import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { config } from './config';
import { employeesRouter } from './routes/employees';
import { timeUtilizationRouter } from './routes/timeUtilization';
import { qaScoresRouter } from './routes/qaScores';
import { ktRouter } from './routes/kt';
import { maintenanceRouter } from './routes/maintenance';
import { callQaRouter } from './routes/callQa';
import { dashboardRouter } from './routes/dashboard';
import { settingsRouter } from './routes/settings';
import { authRouter } from './routes/auth';
import { usersRouter } from './routes/users';
import { jiraRouter } from './routes/jira';

export const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.get('/api/config', (_req, res) =>
  res.json({ qa: config.qa, callQa: config.callQa, pmiConfigured: Boolean(config.pmiApiUrl) })
);

app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/employees', employeesRouter);
app.use('/api/time-utilization', timeUtilizationRouter);
app.use('/api/qa-scores', qaScoresRouter);
app.use('/api/kt', ktRouter);
app.use('/api/maintenance', maintenanceRouter);
app.use('/api/call-qa', callQaRouter);
app.use('/api/jira', jiraRouter);
app.use('/api/dashboard', dashboardRouter);

// Downloadable Excel import templates (served under /api so the dev proxy forwards them).
const TEMPLATES: Record<string, string> = {
  'time-utilization': 'time-utilization-template.xlsx',
  'qa-scores': 'qa-scores-template.xlsx',
  kt: 'kt-template.xlsx',
  maintenance: 'maintenance-template.xlsx',
  'call-qa': 'call-qa-template.xlsx',
};
app.get('/api/templates/:key', (req, res) => {
  const fileName = TEMPLATES[req.params.key];
  if (!fileName) return res.status(404).json({ error: 'Unknown template.' });
  const full = path.join(path.resolve(__dirname, '../../docs'), fileName);
  if (!fs.existsSync(full)) return res.status(404).json({ error: 'Template not generated. Run: npm run make:template' });
  return res.download(full, fileName);
});

// Serve the built frontend (if present) so `npm start` runs the whole app on one port.
const frontendDist = path.resolve(__dirname, '../../frontend/dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// Central error handler.
app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  // eslint-disable-next-line no-console
  console.error(err);
  const status = typeof err?.status === 'number' ? err.status : 500;
  res.status(status).json({ error: err?.message ?? 'Internal server error' });
});
