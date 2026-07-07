import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { prisma } from '../db';
import { asyncHandler } from '../lib/asyncHandler';
import { requireRole } from '../middleware/roles';

export const qcParamsRouter = Router();

const SECTIONS = ['CALL', 'CASE'];

// POST /api/qc-parameters  { section, text, critical? }
qcParamsRouter.post(
  '/',
  requireRole('Admin', 'QA Lead'),
  asyncHandler(async (req, res) => {
    const section = String(req.body?.section ?? '').toUpperCase();
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    if (!SECTIONS.includes(section)) return res.status(400).json({ error: "section must be 'CALL' or 'CASE'." });
    if (!text) return res.status(400).json({ error: 'text is required.' });
    // Append after the current last parameter in this section.
    const last = await prisma.qcParameter.findFirst({ where: { section }, orderBy: { order: 'desc' }, select: { order: true } });
    const param = await prisma.qcParameter.create({
      data: {
        code: `QC_${randomUUID().slice(0, 8)}`,
        section,
        text,
        order: (last?.order ?? 0) + 1,
        active: true,
        critical: Boolean(req.body?.critical),
      },
    });
    res.status(201).json(param);
  })
);

// PATCH /api/qc-parameters/:id  { text?, critical?, active? }
qcParamsRouter.patch(
  '/:id',
  requireRole('Admin', 'QA Lead'),
  asyncHandler(async (req, res) => {
    const { text, critical, active } = req.body ?? {};
    const data: { text?: string; critical?: boolean; active?: boolean } = {};
    if (text !== undefined) {
      const trimmed = String(text).trim();
      if (!trimmed) return res.status(400).json({ error: 'text cannot be empty.' });
      data.text = trimmed;
    }
    if (critical !== undefined) data.critical = Boolean(critical);
    if (active !== undefined) data.active = Boolean(active);
    const param = await prisma.qcParameter.update({ where: { id: req.params.id }, data });
    res.json(param);
  })
);

// POST /api/qc-parameters/reorder  { section, orderedIds: string[] }
qcParamsRouter.post(
  '/reorder',
  requireRole('Admin', 'QA Lead'),
  asyncHandler(async (req, res) => {
    const section = String(req.body?.section ?? '').toUpperCase();
    const ids: unknown = req.body?.orderedIds;
    if (!SECTIONS.includes(section)) return res.status(400).json({ error: "section must be 'CALL' or 'CASE'." });
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'orderedIds must be an array.' });
    await prisma.$transaction(
      ids.map((id, i) => prisma.qcParameter.update({ where: { id: String(id) }, data: { order: i + 1 } }))
    );
    const params = await prisma.qcParameter.findMany({ where: { section }, orderBy: { order: 'asc' } });
    res.json(params);
  })
);

// DELETE /api/qc-parameters/:id -> hard-delete when unused, else soft-deactivate (preserves history)
qcParamsRouter.delete(
  '/:id',
  requireRole('Admin', 'QA Lead'),
  asyncHandler(async (req, res) => {
    const used = await prisma.callQcAnswer.count({ where: { parameterId: req.params.id } });
    if (used > 0) {
      const param = await prisma.qcParameter.update({ where: { id: req.params.id }, data: { active: false } });
      return res.json({ deleted: false, deactivated: true, param });
    }
    await prisma.qcParameter.delete({ where: { id: req.params.id } });
    res.json({ deleted: true, deactivated: false });
  })
);
