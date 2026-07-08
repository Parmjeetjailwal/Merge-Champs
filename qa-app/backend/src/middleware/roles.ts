import type { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../lib/auth';

export const ROLES = [
  'Admin',
  'QA Lead',
  'Call QA Analyst',
  'Maintenance',
  'Time Analyst',
  'Trainee',
  'Team Member',
] as const;
export type Role = (typeof ROLES)[number];

/**
 * Which roles may access each navigation section / module (by stable key).
 * `Admin` is always allowed everywhere and is omitted from these lists.
 * This is the single source of truth for backend authorization and is mirrored
 * on the frontend in `frontend/src/perms.ts`.
 */
export const SECTION_ACCESS: Record<string, Role[]> = {
  dashboard: ['QA Lead', 'Call QA Analyst', 'Maintenance', 'Time Analyst', 'Trainee', 'Team Member'],
  'time-utilization': ['QA Lead', 'Time Analyst'],
  'call-qa': ['QA Lead', 'Call QA Analyst'],
  'case-qa': ['QA Lead', 'Call QA Analyst'],
  kt: ['QA Lead', 'Trainee'],
  maintenance: ['Maintenance'],
  settings: [],
  users: [],
};

/** True when the given role may access the section/module identified by `key`. */
export function canAccessSection(role: string, key: string): boolean {
  if (role === 'Admin') return true;
  const allowed = SECTION_ACCESS[key];
  if (!allowed) return false;
  return allowed.includes(role as Role);
}

/**
 * Resolves the caller's role. Prefers a JWT Bearer token; falls back to the
 * `x-role` header for local dev. Defaults to Admin when nothing is supplied.
 */
export function resolveRole(req: Request): string {
  const auth = req.header('authorization');
  if (auth?.startsWith('Bearer ')) {
    const user = verifyToken(auth.slice(7));
    if (user) return user.role;
  }
  return String(req.header('x-role') ?? 'Admin');
}

export function requireRole(...allowed: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const role = resolveRole(req);
    if (!allowed.includes(role as Role)) {
      return res.status(403).json({
        error: `This action requires role: ${allowed.join(' or ')}. Current role: ${role}.`,
      });
    }
    next();
  };
}
