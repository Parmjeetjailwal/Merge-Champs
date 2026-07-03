import { Router } from 'express';
import { prisma } from '../db';
import { asyncHandler } from '../lib/asyncHandler';
import { requireRole } from '../middleware/roles';

export const employeesRouter = Router();

employeesRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const employees = await prisma.employee.findMany({ orderBy: { name: 'asc' } });
    res.json(employees);
  })
);

employeesRouter.post(
  '/',
  requireRole('Admin'),
  asyncHandler(async (req, res) => {
    const { name, email, team, role } = req.body ?? {};
    if (!name || !email) {
      return res.status(400).json({ error: 'name and email are required' });
    }
    const employee = await prisma.employee.create({
      data: { name, email, team: team ?? null, role: role ?? 'Team Member' },
    });
    res.status(201).json(employee);
  })
);
