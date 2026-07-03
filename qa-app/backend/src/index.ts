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

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.get('/api/config', (_req, res) =>
  res.json({ qa: config.qa, callQa: config.callQa, pmiConfigured: Boolean(config.pmiApiUrl) })
);

app.use('/api/employees', employeesRouter);
app.use('/api/time-utilization', timeUtilizationRouter);
app.use('/api/qa-scores', qaScoresRouter);
app.use('/api/kt', ktRouter);
app.use('/api/maintenance', maintenanceRouter);
app.use('/api/call-qa', callQaRouter);
app.use('/api/dashboard', dashboardRouter);

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
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ error: err?.message ?? 'Internal server error' });
});

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`QA backend listening on http://localhost:${config.port}`);
});
