import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AuthLayout from '../components/AuthLayout';
import PasswordField from '../components/PasswordField';
import TermsCheck from '../components/TermsCheck';
import { validateEmail, validatePassword, validateName } from '../lib/validate';

const ErrorMsg = ({ error }: { error?: string }) =>
  error ? (
    <p className="mt-1.5 flex items-start gap-1 text-xs font-medium text-red-600">
      <svg className="mt-px h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
      </svg>
      {error}
    </p>
  ) : null;

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [agreed, setAgreed] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; email?: string; password?: string; terms?: string; submit?: string }>({});
  const [attempted, setAttempted] = useState(false);
  const [loading, setLoading] = useState(false);

  const validate = () => {
    const next: typeof errors = {};
    const n = validateName(form.name);
    const e = validateEmail(form.email);
    const p = validatePassword(form.password);
    if (n) next.name = n;
    if (e) next.email = e;
    if (p) next.password = p;
    if (!agreed) next.terms = 'Please accept the Terms & Conditions before creating an account.';
    return next;
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setAttempted(true);
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setLoading(true);
    try {
      await register(form.name.trim(), form.email.trim(), form.password);
      navigate('/account');
    } catch (err) {
      setErrors({ submit: (err as Error).message });
    } finally {
      setLoading(false);
    }
  };

  const setField = (key: keyof typeof form) => (v: string) => {
    setForm((f) => ({ ...f, [key]: v }));
    if (attempted) {
      setErrors((prev) => ({
        ...prev,
        name: key === 'name' ? validateName(v) ?? undefined : prev.name,
        email: key === 'email' ? validateEmail(v) ?? undefined : prev.email,
        password: key === 'password' ? validatePassword(v) ?? undefined : prev.password,
      }));
    }
  };

  const fieldClass = (error?: string, valid?: boolean) =>
    `input ${error ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20' : valid ? 'border-emerald-400 focus:border-emerald-500 focus:ring-emerald-500/20' : ''}`;

  return (
    <AuthLayout
      eyebrow="Join the table"
      title="Create your account"
      subtitle="Save your details, track orders and check out faster on your next favourite set."
      footer={
        <>
          Already registered?{' '}
          <Link to="/login" className="font-semibold text-teal-700 hover:text-teal-800">Sign in</Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="name" className="label">Full name</label>
          <input
            id="name"
            value={form.name}
            onChange={(e) => setField('name')(e.target.value)}
            placeholder="Amara Ncube"
            autoComplete="name"
            aria-invalid={!!errors.name}
            className={fieldClass(errors.name, attempted && !errors.name && form.name.trim().length > 0)}
          />
          <ErrorMsg error={errors.name} />
        </div>

        <div>
          <label htmlFor="email" className="label">Email</label>
          <div className="relative">
            <input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => setField('email')(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              aria-invalid={!!errors.email}
              className={`${fieldClass(errors.email, attempted && !errors.email && form.email.trim().length > 0)} ${(attempted && form.email.trim() && !errors.email) || errors.email ? 'pr-11' : ''}`}
            />
            {errors.email && (
              <svg className="pointer-events-none absolute right-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
              </svg>
            )}
            {attempted && form.email.trim() && !errors.email && (
              <svg className="pointer-events-none absolute right-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
          </div>
          <ErrorMsg error={errors.email} />
        </div>

        <PasswordField
          id="password"
          label="Password"
          value={form.password}
          onChange={setField('password')}
          autoComplete="new-password"
          placeholder="At least 8 characters"
          error={errors.password}
          valid={attempted && !errors.password && form.password.length >= 8}
        />

        <TermsCheck checked={agreed} onChange={setAgreed} error={errors.terms} />

        {errors.submit && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600">{errors.submit}</p>}

        <button disabled={loading} className="btn-gold w-full">
          {loading ? (
            <>
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
              Creating…
            </>
          ) : (
            'Create account'
          )}
        </button>
      </form>
    </AuthLayout>
  );
}