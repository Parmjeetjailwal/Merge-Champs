import { Router } from 'express';
import { prisma } from '../db';
import { asyncHandler } from '../lib/asyncHandler';
import { requireRole } from '../middleware/roles';
import multer from 'multer';
import { parseSheet, getField, toDate } from '../lib/import';

export const ktRouter = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

function withProgress(joinee: {
  id: string;
  name: string;
  joinDate: Date;
  team: string | null;
  mentor: string | null;
  topics: {
    id: string;
    topicName: string;
    status: string;
    completedDate: Date | null;
    targetDate: Date | null;
    notes: string | null;
    signedOffBy: string | null;
  }[];
  accesses?: { status: string }[];
}) {
  const total = joinee.topics.length;
  const completed = joinee.topics.filter((t) => t.status === 'Completed').length;
  const now = new Date();
  const overdue = joinee.topics.filter(
    (t) => t.status === 'Pending' && t.targetDate && new Date(t.targetDate) < now
  ).length;
  const accesses = joinee.accesses ?? [];
  const accessGranted = accesses.filter((a) => a.status === 'Granted').length;
  const accessPending = accesses.filter((a) => a.status === 'Pending').length;
  return {
    ...joinee,
    progress: { completed, total, percent: total ? Math.round((completed / total) * 100) : 0, overdue },
    accessProgress: {
      granted: accessGranted,
      pending: accessPending,
      total: accesses.length,
      percent: accesses.length ? Math.round((accessGranted / accesses.length) * 100) : 0,
    },
  };
}

// GET /api/kt/joinees
ktRouter.get(
  '/joinees',
  asyncHandler(async (_req, res) => {
    const joinees = await prisma.joinee.findMany({
      include: {
        topics: { orderBy: { topicName: 'asc' } },
        accesses: {
          include: { accessItem: { include: { project: true } } },
          orderBy: [{ accessItem: { project: { order: 'asc' } } }, { accessItem: { order: 'asc' } }],
        },
      },
      orderBy: { joinDate: 'desc' },
    });
    res.json(joinees.map(withProgress));
  })
);

// POST /api/kt/joinees  { name, joinDate, team?, mentor?, topics?: string[] }
ktRouter.post(
  '/joinees',
  requireRole('Admin', 'QA Lead'),
  asyncHandler(async (req, res) => {
    const { name, joinDate, team, mentor, topics } = req.body ?? {};
    if (!name) return res.status(400).json({ error: 'name is required.' });
    const joinee = await prisma.joinee.create({
      data: {
        name,
        joinDate: joinDate ? new Date(joinDate) : new Date(),
        team: team ?? null,
        mentor: mentor ?? null,
        topics: Array.isArray(topics)
          ? { create: topics.filter(Boolean).map((topicName: string) => ({ topicName })) }
          : undefined,
      },
      include: { topics: true },
    });
    res.status(201).json(withProgress(joinee));
  })
);

// POST /api/kt/upload  (multipart field: file) — rows of joinee + topic
ktRouter.post(
  '/upload',
  requireRole('Admin', 'QA Lead'),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const file = (req as unknown as { file?: { buffer: Buffer } }).file;
    if (!file) return res.status(400).json({ error: 'No file uploaded (form field "file").' });
    const rows = parseSheet(file.buffer);
    const errors: { row: number; message: string }[] = [];
    let joineesCreated = 0;
    let topicsAdded = 0;
    const cache = new Map<string, string>();
    for (let i = 0; i < rows.length; i++) {
      const rowNo = i + 2;
      const row = rows[i];
      const joineeName = getField(row, ['Joinee', 'Joinee Name', 'Name']);
      const topicName = getField(row, ['Topic', 'Topic Name']);
      const statusRaw = getField(row, ['Status']);
      const team = getField(row, ['Team']);
      const mentor = getField(row, ['Mentor']);
      const joinDate = toDate(getField(row, ['Join Date', 'Joined']));
      const targetDate = toDate(getField(row, ['Target Date', 'Target']));
      if (!joineeName) {
        errors.push({ row: rowNo, message: 'Missing joinee name.' });
        continue;
      }
      const key = String(joineeName).trim();
      let joineeId = cache.get(key.toLowerCase());
      if (!joineeId) {
        let joinee = await prisma.joinee.findFirst({ where: { name: key } });
        if (!joinee) {
          joinee = await prisma.joinee.create({
            data: {
              name: key,
              joinDate: joinDate ?? new Date(),
              team: team ? String(team).trim() : null,
              mentor: mentor ? String(mentor).trim() : null,
            },
          });
          joineesCreated++;
        }
        joineeId = joinee.id;
        cache.set(key.toLowerCase(), joineeId);
      }
      if (topicName) {
        const status = String(statusRaw ?? '').trim().toLowerCase() === 'completed' ? 'Completed' : 'Pending';
        await prisma.kTTopic.create({
          data: {
            joineeId,
            topicName: String(topicName).trim(),
            status,
            completedDate: status === 'Completed' ? new Date() : null,
            targetDate,
          },
        });
        topicsAdded++;
      }
    }
    res.json({ joineesCreated, topicsAdded, errors, totalRows: rows.length });
  })
);

// POST /api/kt/joinees/:id/topics  { topicName }
ktRouter.post(
  '/joinees/:id/topics',
  requireRole('Admin', 'QA Lead'),
  asyncHandler(async (req, res) => {
    const { topicName } = req.body ?? {};
    if (!topicName) return res.status(400).json({ error: 'topicName is required.' });
    const exists = await prisma.joinee.findUnique({ where: { id: req.params.id } });
    if (!exists) return res.status(404).json({ error: 'Joinee not found.' });
    await prisma.kTTopic.create({ data: { joineeId: req.params.id, topicName } });
    const joinee = await prisma.joinee.findUnique({
      where: { id: req.params.id },
      include: { topics: { orderBy: { topicName: 'asc' } } },
    });
    res.status(201).json(joinee ? withProgress(joinee) : null);
  })
);

// PATCH /api/kt/topics/:id  { status?, targetDate?, notes?, signedOffBy? }
ktRouter.patch(
  '/topics/:id',
  requireRole('Admin', 'QA Lead'),
  asyncHandler(async (req, res) => {
    const { status, targetDate, notes, signedOffBy } = req.body ?? {};
    const data: {
      status?: string;
      completedDate?: Date | null;
      targetDate?: Date | null;
      notes?: string | null;
      signedOffBy?: string | null;
    } = {};
    if (status !== undefined) {
      if (status !== 'Completed' && status !== 'Pending') {
        return res.status(400).json({ error: "status must be 'Completed' or 'Pending'." });
      }
      data.status = status;
      data.completedDate = status === 'Completed' ? new Date() : null;
    }
    if (targetDate !== undefined) data.targetDate = targetDate ? new Date(targetDate) : null;
    if (notes !== undefined) data.notes = notes || null;
    if (signedOffBy !== undefined) data.signedOffBy = signedOffBy || null;
    const topic = await prisma.kTTopic.update({ where: { id: req.params.id }, data });
    res.json(topic);
  })
);

// DELETE /api/kt/topics/:id
ktRouter.delete(
  '/topics/:id',
  requireRole('Admin', 'QA Lead'),
  asyncHandler(async (req, res) => {
    await prisma.kTTopic.delete({ where: { id: req.params.id } });
    res.status(204).end();
  })
);

// DELETE /api/kt/joinees/:id
ktRouter.delete(
  '/joinees/:id',
  requireRole('Admin', 'QA Lead'),
  asyncHandler(async (req, res) => {
    await prisma.joinee.delete({ where: { id: req.params.id } });
    res.status(204).end();
  })
);

// GET /api/kt/templates
ktRouter.get(
  '/templates',
  asyncHandler(async (_req, res) => {
    const templates = await prisma.kTTemplate.findMany({
      include: { topics: { orderBy: { topicName: 'asc' } } },
      orderBy: { name: 'asc' },
    });
    res.json(templates);
  })
);

// POST /api/kt/templates  { name, team?, topics?: string[] }
ktRouter.post(
  '/templates',
  requireRole('Admin', 'QA Lead'),
  asyncHandler(async (req, res) => {
    const { name, team, topics } = req.body ?? {};
    if (!name) return res.status(400).json({ error: 'name is required.' });
    const template = await prisma.kTTemplate.create({
      data: {
        name,
        team: team ?? null,
        topics: Array.isArray(topics)
          ? { create: topics.filter(Boolean).map((topicName: string) => ({ topicName })) }
          : undefined,
      },
      include: { topics: true },
    });
    res.status(201).json(template);
  })
);

// POST /api/kt/joinees/:id/apply-template  { templateId }
ktRouter.post(
  '/joinees/:id/apply-template',
  requireRole('Admin', 'QA Lead'),
  asyncHandler(async (req, res) => {
    const { templateId } = req.body ?? {};
    const template = await prisma.kTTemplate.findUnique({ where: { id: String(templateId) }, include: { topics: true } });
    if (!template) return res.status(404).json({ error: 'Template not found.' });
    const joinee = await prisma.joinee.findUnique({ where: { id: req.params.id } });
    if (!joinee) return res.status(404).json({ error: 'Joinee not found.' });
    if (template.topics.length > 0) {
      await prisma.kTTopic.createMany({
        data: template.topics.map((t) => ({ joineeId: req.params.id, topicName: t.topicName })),
      });
    }
    const updated = await prisma.joinee.findUnique({
      where: { id: req.params.id },
      include: { topics: { orderBy: { topicName: 'asc' } } },
    });
    res.status(201).json(updated ? withProgress(updated) : null);
  })
);

// ---------------------------------------------------------------------------
// KT OPS — Project access lists
// ---------------------------------------------------------------------------

function accessProgress(rows: { status: string }[]) {
  const total = rows.length;
  const granted = rows.filter((r) => r.status === 'Granted').length;
  const pending = rows.filter((r) => r.status === 'Pending').length;
  return { granted, pending, total, percent: total ? Math.round((granted / total) * 100) : 0 };
}

// GET /api/kt/projects — active projects with their access items
ktRouter.get(
  '/projects',
  asyncHandler(async (_req, res) => {
    const projects = await prisma.project.findMany({
      where: { active: true },
      include: { accessItems: { where: { active: true }, orderBy: { order: 'asc' } } },
      orderBy: { order: 'asc' },
    });
    res.json(projects);
  })
);

// POST /api/kt/projects/:projectId/access-items  { name }
ktRouter.post(
  '/projects/:projectId/access-items',
  requireRole('Admin', 'QA Lead'),
  asyncHandler(async (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!name) return res.status(400).json({ error: 'name is required.' });
    const project = await prisma.project.findUnique({ where: { id: req.params.projectId } });
    if (!project) return res.status(404).json({ error: 'Project not found.' });
    const existing = await prisma.accessItem.findUnique({
      where: { projectId_name: { projectId: project.id, name } },
    });
    if (existing) return res.status(409).json({ error: 'An access with that name already exists for this project.' });
    const count = await prisma.accessItem.count({ where: { projectId: project.id } });
    const item = await prisma.accessItem.create({
      data: { projectId: project.id, name, order: count },
    });
    res.status(201).json(item);
  })
);

// PATCH /api/kt/access-items/:id  { name?, active? }
ktRouter.patch(
  '/access-items/:id',
  requireRole('Admin', 'QA Lead'),
  asyncHandler(async (req, res) => {
    const { name, active } = req.body ?? {};
    const data: { name?: string; active?: boolean } = {};
    if (name !== undefined) {
      const trimmed = String(name).trim();
      if (!trimmed) return res.status(400).json({ error: 'name cannot be empty.' });
      data.name = trimmed;
    }
    if (active !== undefined) data.active = Boolean(active);
    const item = await prisma.accessItem.update({ where: { id: req.params.id }, data });
    res.json(item);
  })
);

// DELETE /api/kt/access-items/:id
ktRouter.delete(
  '/access-items/:id',
  requireRole('Admin', 'QA Lead'),
  asyncHandler(async (req, res) => {
    await prisma.accessItem.delete({ where: { id: req.params.id } });
    res.status(204).end();
  })
);

// GET /api/kt/joinees/:id/access — provisioning rows for a joinee
ktRouter.get(
  '/joinees/:id/access',
  asyncHandler(async (req, res) => {
    const rows = await prisma.joineeAccess.findMany({
      where: { joineeId: req.params.id },
      include: { accessItem: { include: { project: true } } },
      orderBy: [{ accessItem: { project: { order: 'asc' } } }, { accessItem: { order: 'asc' } }],
    });
    res.json({ accesses: rows, progress: accessProgress(rows) });
  })
);

// POST /api/kt/joinees/:id/access/apply  { projectId } — bulk-create pending rows
ktRouter.post(
  '/joinees/:id/access/apply',
  requireRole('Admin', 'QA Lead'),
  asyncHandler(async (req, res) => {
    const projectId = typeof req.body?.projectId === 'string' ? req.body.projectId : '';
    if (!projectId) return res.status(400).json({ error: 'projectId is required.' });
    const joinee = await prisma.joinee.findUnique({ where: { id: req.params.id } });
    if (!joinee) return res.status(404).json({ error: 'Joinee not found.' });
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { accessItems: { where: { active: true }, orderBy: { order: 'asc' } } },
    });
    if (!project) return res.status(404).json({ error: 'Project not found.' });
    const existing = await prisma.joineeAccess.findMany({
      where: { joineeId: joinee.id, accessItem: { projectId: project.id } },
      select: { accessItemId: true },
    });
    const already = new Set(existing.map((r) => r.accessItemId));
    const toCreate = project.accessItems.filter((it) => !already.has(it.id));
    if (toCreate.length > 0) {
      await prisma.joineeAccess.createMany({
        data: toCreate.map((it) => ({ joineeId: joinee.id, accessItemId: it.id, status: 'Pending' })),
      });
    }
    const rows = await prisma.joineeAccess.findMany({
      where: { joineeId: joinee.id },
      include: { accessItem: { include: { project: true } } },
      orderBy: [{ accessItem: { project: { order: 'asc' } } }, { accessItem: { order: 'asc' } }],
    });
    res.status(201).json({ added: toCreate.length, accesses: rows, progress: accessProgress(rows) });
  })
);

// PATCH /api/kt/joinee-access/:id  { status?, grantedDate?, notes?, requestedBy? }
ktRouter.patch(
  '/joinee-access/:id',
  requireRole('Admin', 'QA Lead'),
  asyncHandler(async (req, res) => {
    const { status, grantedDate, notes, requestedBy } = req.body ?? {};
    const data: { status?: string; grantedDate?: Date | null; notes?: string | null; requestedBy?: string | null } = {};
    if (status !== undefined) {
      if (!['Pending', 'Granted', 'NA'].includes(status)) {
        return res.status(400).json({ error: "status must be 'Pending', 'Granted' or 'NA'." });
      }
      data.status = status;
      // Default the granted date to now when marking Granted without an explicit date.
      if (status === 'Granted' && grantedDate === undefined) data.grantedDate = new Date();
      if (status !== 'Granted') data.grantedDate = null;
    }
    if (grantedDate !== undefined) data.grantedDate = grantedDate ? new Date(grantedDate) : null;
    if (notes !== undefined) data.notes = notes || null;
    if (requestedBy !== undefined) data.requestedBy = requestedBy ? String(requestedBy).trim() : null;
    const row = await prisma.joineeAccess.update({
      where: { id: req.params.id },
      data,
      include: { accessItem: { include: { project: true } } },
    });
    res.json(row);
  })
);

// DELETE /api/kt/joinee-access/:id
ktRouter.delete(
  '/joinee-access/:id',
  requireRole('Admin', 'QA Lead'),
  asyncHandler(async (req, res) => {
    await prisma.joineeAccess.delete({ where: { id: req.params.id } });
    res.status(204).end();
  })
);
