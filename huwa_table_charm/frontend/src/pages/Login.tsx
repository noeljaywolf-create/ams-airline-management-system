import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AuthLayout from '../components/AuthLayout';
import PasswordField from '../components/PasswordField';
import TermsCheck from '../components/TermsCheck';
import { validateEmail, validatePassword } from '../lib/validate';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; terms?: string; submit?: string }>({});
  const [attempted, setAttempted] = useState(false);
  const [loading, setLoading] = useState(false);

  const validate = () => {
    const next: typeof errors = {};
    const e = validateEmail(email);
    const p = validatePassword(password);
    if (e) next.email = e;
    if (p) next.password = p;
    if (!agreed) next.terms = 'Please accept the Terms & Conditions before signing in.';
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
      await login(email.trim(), password);
      navigate('/account');
    } catch (err) {
      setErrors({ submit: (err as Error).message });
    } finally {
      setLoading(false);
    }
  };

  const onEmailChange = (v: string) => {
    setEmail(v);
    if (attempted) setErrors((prev) => ({ ...prev, email: validateEmail(v) ?? undefined }));
  };

  return (
    <AuthLayout
      eyebrow="Welcome back"
      title="Sign in to HUWA"
      subtitle={
        <>
          Just browsing? <Link to="/shop" className="font-medium text-stone-700 underline decoration-stone-300 underline-offset-2 hover:text-teal-700">Explore the collection</Link> anytime.
          <span className="mt-1.5 block text-xs text-stone-400">
            Demo: <span className="font-mono">demo@huwa.com</span> / <span className="font-mono">Pass1234!</span> · Admin: <span className="font-mono">admin@huwa.com</span>
          </span>
        </>
      }
      footer={
        <>
          New here?{' '}
          <Link to="/register" className="font-semibold text-teal-700 hover:text-teal-800">Create an account</Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="email" className="label">Email</label>
          <div className="relative">
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => onEmailChange(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              aria-invalid={!!errors.email}
              autoFocus
              className={`input ${errors.email ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20' : attempted && email.trim() ? 'border-emerald-400 focus:border-emerald-500 focus:ring-emerald-500/20' : ''}`}
            />
            {attempted && email.trim() && !errors.email && (
              <svg className="pointer-events-none absolute right-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            {errors.email && (
              <svg className="pointer-events-none absolute right-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
              </svg>
            )}
          </div>
          {errors.email && (
            <p className="mt-1.5 flex items-start gap-1 text-xs font-medium text-red-600">
              <svg className="mt-px h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
              </svg>
              {errors.email}
            </p>
          )}
        </div>

        <PasswordField
          id="password"
          value={password}
          onChange={(v) => {
            setPassword(v);
            if (attempted) setErrors((prev) => ({ ...prev, password: validatePassword(v) ?? undefined }));
          }}
          autoComplete="current-password"
          error={errors.password}
          valid={attempted && !errors.password && password.length >= 8}
        />

        <TermsCheck checked={agreed} onChange={setAgreed} error={errors.terms} />

        {errors.submit && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600">{errors.submit}</p>}

        <button disabled={loading} className="btn-primary w-full">
          {loading ? (
            <>
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
              Signing in…
            </>
          ) : (
            'Sign in'
          )}
        </button>
      </form>
    </AuthLayout>
  );
}