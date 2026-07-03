import { Router } from 'express';
import { prisma } from '../db';
import { asyncHandler } from '../lib/asyncHandler';
import { requireRole } from '../middleware/roles';

export const ktRouter = Router();

function withProgress(joinee: {
  id: string;
  name: string;
  joinDate: Date;
  team: string | null;
  mentor: string | null;
  topics: { id: string; topicName: string; status: string; completedDate: Date | null }[];
}) {
  const total = joinee.topics.length;
  const completed = joinee.topics.filter((t) => t.status === 'Completed').length;
  return {
    ...joinee,
    progress: { completed, total, percent: total ? Math.round((completed / total) * 100) : 0 },
  };
}

// GET /api/kt/joinees
ktRouter.get(
  '/joinees',
  asyncHandler(async (_req, res) => {
    const joinees = await prisma.joinee.findMany({
      include: { topics: { orderBy: { topicName: 'asc' } } },
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

// PATCH /api/kt/topics/:id  { status: 'Completed' | 'Pending' }
ktRouter.patch(
  '/topics/:id',
  requireRole('Admin', 'QA Lead'),
  asyncHandler(async (req, res) => {
    const { status } = req.body ?? {};
    if (status !== 'Completed' && status !== 'Pending') {
      return res.status(400).json({ error: "status must be 'Completed' or 'Pending'." });
    }
    const topic = await prisma.kTTopic.update({
      where: { id: req.params.id },
      data: { status, completedDate: status === 'Completed' ? new Date() : null },
    });
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
