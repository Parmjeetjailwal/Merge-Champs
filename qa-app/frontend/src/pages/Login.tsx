import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { apiError } from '../api';

export function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('admin@example.com');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const doLogin = async (em: string, pw: string) => {
    setError('');
    setBusy(true);
    try {
      await login(em, pw);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="brand-logo">
            <ShieldCheck size={22} />
          </span>
          <div>
            <h1 className="auth-title">QA Suite</h1>
            <p className="auth-sub">Sign in to your quality workspace</p>
          </div>
        </div>

        {error && <div className="notice error">{error}</div>}

        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            doLogin(email, password);
          }}
        >
          <label className="field">
            Email
            <input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
          </label>
          <label className="field">
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </label>
          <button className="btn" type="submit" disabled={busy} style={{ justifyContent: 'center' }}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
