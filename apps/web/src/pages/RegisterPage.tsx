import { registerSchema } from '@chatverse/protocol';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ApiClientError } from '@/lib/api';
import { api } from '@/lib/session';
import { useAuthStore } from '@/stores/auth';
import { AuthShell } from './AuthShell';

export function RegisterPage() {
  const status = useAuthStore((s) => s.status);
  const setSession = useAuthStore((s) => s.setSession);
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', email: '', displayName: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (status === 'authenticated') return <Navigate to="/app" replace />;

  function field(name: keyof typeof form, label: string, type = 'text', autoComplete?: string) {
    return (
      <div>
        <label htmlFor={name} className="text-xs font-medium text-muted">
          {label}
        </label>
        <input
          id={name}
          type={type}
          autoComplete={autoComplete}
          className="input mt-1"
          value={form[name]}
          onChange={(e) => setForm((f) => ({ ...f, [name]: e.target.value }))}
          required
        />
      </div>
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = registerSchema.safeParse(form);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setError(issue ? `${issue.path.join('.')}: ${issue.message}` : 'Invalid input');
      return;
    }
    setBusy(true);
    try {
      const auth = await api.auth.register(parsed.data);
      setSession(auth);
      navigate('/app', { replace: true });
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not create account');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Create your account">
      <form onSubmit={submit} className="space-y-3" noValidate>
        {field('displayName', 'Display name', 'text', 'name')}
        {field('username', 'Username (lowercase, digits, _ .)', 'text', 'username')}
        {field('email', 'Email', 'email', 'email')}
        {field('password', 'Password (10+ characters)', 'password', 'new-password')}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? 'Creating…' : 'Create account'}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-muted">
        Already registered?{' '}
        <Link to="/login" className="text-accent underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
