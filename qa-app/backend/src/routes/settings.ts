import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler';
import { requireRole } from '../middleware/roles';
import { getSettings, updateSettings } from '../settings';

export const settingsRouter = Router();

// GET /api/settings
settingsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json(await getSettings());
  })
);

// PUT /api/settings  (Admin) — merges the provided patch into the stored config
settingsRouter.put(
  '/',
  requireRole('Admin'),
  asyncHandler(async (req, res) => {
    const updated = await updateSettings(req.body ?? {});
    res.json(updated);
  })
);
