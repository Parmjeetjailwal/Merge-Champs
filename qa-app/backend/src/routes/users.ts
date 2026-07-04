import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../db';
import { asyncHandler } from '../lib/asyncHandler';
import { requireRole, ROLES } from '../middleware/roles';

export const usersRouter = Router();

const publicSelect = { id: true, email: true, role: true, employeeId: true, createdAt: true } as const;
const isRole = (r: unknown) => (ROLES as readonly string[]).includes(String(r));

// GET /api/users  (Admin)
usersRouter.get(
  '/',
  requireRole('Admin'),
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({ orderBy: { email: 'asc' }, select: publicSelect });
    res.json(users);
  })
);

// POST /api/users  (Admin)
usersRouter.post(
  '/',
  requireRole('Admin'),
  asyncHandler(async (req, res) => {
    const { email, password, role, employeeId } = req.body ?? {};
    if (!email || !password) return res.status(400).json({ error: 'email and password are required.' });
    if (role && !isRole(role)) return res.status(400).json({ error: 'Invalid role.' });
    const passwordHash = await bcrypt.hash(String(password), 10);
    const user = await prisma.user.create({
      data: { email: String(email).toLowerCase(), passwordHash, role: role ?? 'Team Member', employeeId: employeeId ?? null },
      select: publicSelect,
    });
    res.status(201).json(user);
  })
);

// PATCH /api/users/:id  (Admin) — update role and/or password
usersRouter.patch(
  '/:id',
  requireRole('Admin'),
  asyncHandler(async (req, res) => {
    const { role, password } = req.body ?? {};
    const data: { role?: string; passwordHash?: string } = {};
    if (role !== undefined) {
      if (!isRole(role)) return res.status(400).json({ error: 'Invalid role.' });
      data.role = role;
    }
    if (password) data.passwordHash = await bcrypt.hash(String(password), 10);
    const user = await prisma.user.update({ where: { id: req.params.id }, data, select: publicSelect });
    res.json(user);
  })
);

// DELETE /api/users/:id  (Admin)
usersRouter.delete(
  '/:id',
  requireRole('Admin'),
  asyncHandler(async (req, res) => {
    await prisma.user.delete({ where: { id: req.params.id } });
    res.status(204).end();
  })
);
