import { Router } from 'express';
import { prisma } from '../db';
import { asyncHandler } from '../lib/asyncHandler';
import { requireRole, resolveRole } from '../middleware/roles';

export const sectionsRouter = Router();

// GET /api/sections -> ordered sections (admins get all incl. disabled; others get enabled only)
sectionsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const isAdmin = resolveRole(req) === 'Admin';
    const where = isAdmin ? {} : { enabled: true };
    const sections = await prisma.navSection.findMany({ where, orderBy: { order: 'asc' } });
    res.json(sections);
  })
);

// POST /api/sections (Admin) -> add a custom section entry
sectionsRouter.post(
  '/',
  requireRole('Admin'),
  asyncHandler(async (req, res) => {
    const { key, label, path, icon, adminOnly } = req.body ?? {};
    if (!key || !label || !path) return res.status(400).json({ error: 'key, label and path are required.' });
    const exists = await prisma.navSection.findUnique({ where: { key: String(key) } });
    if (exists) return res.status(409).json({ error: 'A section with that key already exists.' });
    const count = await prisma.navSection.count();
    const section = await prisma.navSection.create({
      data: {
        key: String(key).trim(),
        label: String(label).trim(),
        path: String(path).trim(),
        icon: icon ? String(icon).trim() : 'LayoutDashboard',
        order: count,
        adminOnly: Boolean(adminOnly),
      },
    });
    res.status(201).json(section);
  })
);

// PATCH /api/sections/:id (Admin) -> rename / enable / disable / set icon or order
sectionsRouter.patch(
  '/:id',
  requireRole('Admin'),
  asyncHandler(async (req, res) => {
    const { label, enabled, icon, order, adminOnly } = req.body ?? {};
    const data: { label?: string; enabled?: boolean; icon?: string; order?: number; adminOnly?: boolean } = {};
    if (label !== undefined) {
      const trimmed = String(label).trim();
      if (!trimmed) return res.status(400).json({ error: 'label cannot be empty.' });
      data.label = trimmed;
    }
    if (enabled !== undefined) data.enabled = Boolean(enabled);
    if (icon !== undefined) data.icon = String(icon).trim();
    if (order !== undefined) data.order = Number(order);
    if (adminOnly !== undefined) data.adminOnly = Boolean(adminOnly);
    const section = await prisma.navSection.update({ where: { id: req.params.id }, data });
    res.json(section);
  })
);

// POST /api/sections/reorder (Admin) -> { orderedIds: string[] }
sectionsRouter.post(
  '/reorder',
  requireRole('Admin'),
  asyncHandler(async (req, res) => {
    const ids: unknown = req.body?.orderedIds;
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'orderedIds must be an array.' });
    await prisma.$transaction(
      ids.map((id, i) => prisma.navSection.update({ where: { id: String(id) }, data: { order: i } }))
    );
    const sections = await prisma.navSection.findMany({ orderBy: { order: 'asc' } });
    res.json(sections);
  })
);

// DELETE /api/sections/:id (Admin)
sectionsRouter.delete(
  '/:id',
  requireRole('Admin'),
  asyncHandler(async (req, res) => {
    await prisma.navSection.delete({ where: { id: req.params.id } });
    res.status(204).end();
  })
);
