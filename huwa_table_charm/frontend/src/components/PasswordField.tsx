import { useState } from 'react';

interface PasswordFieldProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  id?: string;
  placeholder?: string;
  autoComplete?: string;
  error?: string | null;
  valid?: boolean;
}

const EYE = (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.964-7.178zM15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const EYE_SLASH = (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
  </svg>
);

export default function PasswordField({
  value,
  onChange,
  label = 'Password',
  id = 'password',
  placeholder,
  autoComplete,
  error,
  valid,
}: PasswordFieldProps) {
  const [show, setShow] = useState(false);
  const border = error
    ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20'
    : valid
      ? 'border-emerald-400 focus:border-emerald-500 focus:ring-emerald-500/20'
      : '';

  return (
    <div>
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="label">{label}</label>
        {valid && !error && (
          <span className="mb-1 flex items-center gap-1 text-xs font-medium text-emerald-600">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.4}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
            Looks good
          </span>
        )}
      </div>
      <div className="relative">
        <input
          id={id}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? '••••••••'}
          autoComplete={autoComplete}
          aria-invalid={!!error}
          className={`input pr-11 ${border}`}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? 'Hide password' : 'Show password'}
          className="absolute right-1.5 top-1/2 grid h-8 w-9 -translate-y-1/2 place-items-center rounded-lg text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700 cursor-pointer"
        >
          {show ? EYE_SLASH : EYE}
        </button>
      </div>
      {error && (
        <p className="mt-1.5 flex items-start gap-1 text-xs font-medium text-red-600">
          <svg className="mt-px h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
          </svg>
          {error}
        </p>
      )}
    </div>
  );
}