import type { Request, Response, NextFunction } from 'express';

export const ROLES = ['Admin', 'QA Lead', 'Call QA Analyst', 'Team Member'] as const;
export type Role = (typeof ROLES)[number];

/**
 * Lightweight role gate for the demo. The active role is read from the `x-role`
 * request header (set by the frontend role switcher). In production this would be
 * replaced by JWT-based auth, but the permission model stays the same.
 */
export function requireRole(...allowed: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const role = String(req.header('x-role') ?? 'Admin');
    if (!allowed.includes(role as Role)) {
      return res.status(403).json({
        error: `This action requires role: ${allowed.join(' or ')}. Current role: ${role}.`,
      });
    }
    next();
  };
}
