import { useEffect, useState } from 'react';
import { api, apiError, ROLES } from '../api';
import { useToast } from '../ui/Toast';
import { useConfirm } from '../ui/Confirm';
import { DataTable } from '../ui/DataTable';
import type { UserRow } from '../types';

export function Users() {
  const toast = useToast();
  const confirm = useConfirm();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ email: '', password: '', role: 'Team Member' });

  const load = () => api.get<UserRow[]>('/users').then((r) => setUsers(r.data)).catch((e) => setError(apiError(e)));
  useEffect(() => {
    load();
  }, []);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.email || !form.password) {
      setError('Email and password are required.');
      return;
    }
    try {
      await api.post('/users', form);
      toast.success('User created.');
      setForm({ email: '', password: '', role: 'Team Member' });
      load();
    } catch (err) {
      const m = apiError(err);
      setError(m);
      toast.error(m);
    }
  };

  const changeRole = async (u: UserRow, role: string) => {
    try {
      await api.patch(`/users/${u.id}`, { role });
      toast.success('Role updated.');
      load();
    } catch (err) {
      toast.error(apiError(err));
    }
  };

  const remove = async (u: UserRow) => {
    const ok = await confirm({ title: 'Delete user', message: `Delete ${u.email}?`, danger: true, confirmLabel: 'Delete' });
    if (!ok) return;
    try {
      await api.delete(`/users/${u.id}`);
      toast.success('User deleted.');
      load();
    } catch (err) {
      toast.error(apiError(err));
    }
  };

  return (
    <div>
      <h2 className="page-title">Users</h2>
      <p className="page-sub">Manage login accounts and roles.</p>
      {error && <div className="notice error">{error}</div>}

      <div className="card no-print" style={{ marginBottom: 18 }}>
        <h3>Add user</h3>
        <form className="stack" onSubmit={add}>
          <div className="row">
            <label className="field">
              Email
              <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </label>
            <label className="field">
              Password
              <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </label>
          </div>
          <label className="field">
            Role
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <button className="btn" type="submit">
            Create user
          </button>
        </form>
      </div>

      <div className="card">
        <h3>Accounts</h3>
        <DataTable
          rows={users}
          rowKey={(u) => u.id}
          emptyText="No users."
          columns={[
            { key: 'email', header: 'Email', value: (u) => u.email },
            {
              key: 'role',
              header: 'Role',
              value: (u) => u.role,
              render: (u) => (
                <select value={u.role} onChange={(e) => changeRole(u, e.target.value)}>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              ),
            },
            { key: 'created', header: 'Created', value: (u) => new Date(u.createdAt).toLocaleDateString() },
          ]}
          actions={(u) => (
            <button className="btn danger icon" onClick={() => remove(u)}>
              Delete
            </button>
          )}
        />
      </div>
    </div>
  );
}
