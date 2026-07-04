import { useAuth } from './AuthContext';
import type { Role } from './api';

// The active role now comes from the authenticated user. Kept as `useRole`
// so existing pages continue to work unchanged.
// eslint-disable-next-line react-refresh/only-export-components
export function useRole(): { role: Role } {
  const { user } = useAuth();
  return { role: (user?.role ?? 'Team Member') as Role };
}
