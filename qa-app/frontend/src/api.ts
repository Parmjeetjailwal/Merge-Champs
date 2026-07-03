import axios from 'axios';

export const ROLES = ['Admin', 'QA Lead', 'Call QA Analyst', 'Team Member'] as const;
export type Role = (typeof ROLES)[number];

const ROLE_KEY = 'qa-role';

export function getRole(): Role {
  return (localStorage.getItem(ROLE_KEY) as Role) || 'Admin';
}
export function setStoredRole(role: Role): void {
  localStorage.setItem(ROLE_KEY, role);
}

export const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((cfg) => {
  cfg.headers = cfg.headers ?? {};
  cfg.headers['x-role'] = getRole();
  return cfg;
});

export function apiError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    return (err.response?.data as { error?: string })?.error ?? err.message;
  }
  return err instanceof Error ? err.message : 'Unexpected error';
}
