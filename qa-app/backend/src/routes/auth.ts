import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../db';
import { asyncHandler } from '../lib/asyncHandler';
import { signToken, verifyToken } from '../lib/auth';

export const authRouter = Router();

// POST /api/auth/login  { email, password } -> { token, user }
authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = req.body ?? {};
    if (!email || !password) return res.status(400).json({ error: 'email and password are required.' });
    const user = await prisma.user.findUnique({ where: { email: String(email).toLowerCase() } });
    if (!user || !(await bcrypt.compare(String(password), user.passwordHash))) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    const token = signToken({ id: user.id, email: user.email, role: user.role });
    res.json({ token, user: { id: user.id, email: user.email, role: user.role } });
  })
);

// GET /api/auth/me  (Bearer token) -> current user
authRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    const auth = req.header('authorization');
    if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Not authenticated.' });
    const user = verifyToken(auth.slice(7));
    if (!user) return res.status(401).json({ error: 'Invalid or expired token.' });
    res.json(user);
  })
);
