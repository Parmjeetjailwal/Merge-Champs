import axios from 'axios';

export const ROLES = ['Admin', 'QA Lead', 'Call QA Analyst', 'Team Member'] as const;
export type Role = (typeof ROLES)[number];

const TOKEN_KEY = 'qa-token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((cfg) => {
  const token = getToken();
  cfg.headers = cfg.headers ?? {};
  if (token) cfg.headers['Authorization'] = `Bearer ${token}`;
  return cfg;
});

export function apiError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    return (err.response?.data as { error?: string })?.error ?? err.message;
  }
  return err instanceof Error ? err.message : 'Unexpected error';
}
