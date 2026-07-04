import type { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../lib/auth';

export const ROLES = ['Admin', 'QA Lead', 'Call QA Analyst', 'Team Member'] as const;
export type Role = (typeof ROLES)[number];

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
