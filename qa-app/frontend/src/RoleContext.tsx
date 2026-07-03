import { createContext, useContext, useState, type ReactNode } from 'react';
import { getRole, setStoredRole, type Role } from './api';

interface RoleContextValue {
  role: Role;
  setRole: (role: Role) => void;
}

const RoleContext = createContext<RoleContextValue>({ role: 'Admin', setRole: () => {} });

export function RoleProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<Role>(getRole());
  const setRole = (r: Role) => {
    setStoredRole(r);
    setRoleState(r);
  };
  return <RoleContext.Provider value={{ role, setRole }}>{children}</RoleContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useRole() {
  return useContext(RoleContext);
}
