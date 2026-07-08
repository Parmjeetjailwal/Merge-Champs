import type { Role } from './api';

/**
 * Which roles may access each navigation section / module (by stable key).
 * `Admin` is always allowed everywhere and is omitted from these lists.
 * This mirrors `backend/src/middleware/roles.ts` (SECTION_ACCESS) and is the
 * single source of truth for the frontend (nav filtering + route guards).
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

/** Maps a route path to its section key. */
export function sectionKeyForPath(path: string): string {
  return path === '/' ? 'dashboard' : path.replace(/^\//, '');
}

/** True when the given role may access the section/module identified by `key`. */
export function canAccessSection(role: Role, key: string): boolean {
  if (role === 'Admin') return true;
  const allowed = SECTION_ACCESS[key];
  if (!allowed) return false;
  return allowed.includes(role);
}

/** True when the given role may open the given route path. */
export function canAccessPath(role: Role, path: string): boolean {
  return canAccessSection(role, sectionKeyForPath(path));
}

// Write-permission helpers (mirror the backend requireRole guards).
const WRITE_QA: Role[] = ['Admin', 'QA Lead', 'Call QA Analyst'];
export const can = {
  uploadTime: (r: Role) => r === 'Admin' || r === 'QA Lead' || r === 'Time Analyst',
  kt: (r: Role) => r === 'Admin' || r === 'QA Lead',
  maintenance: (r: Role) => r === 'Admin' || r === 'Maintenance',
  callQa: (r: Role) => WRITE_QA.includes(r),
  caseQa: (r: Role) => WRITE_QA.includes(r),
};
