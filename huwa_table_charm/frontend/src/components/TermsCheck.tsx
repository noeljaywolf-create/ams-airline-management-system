import { Link } from 'react-router-dom';

interface TermsCheckProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  error?: string | null;
}

export default function TermsCheck({ checked, onChange, error }: TermsCheckProps) {
  return (
    <div>
      <label className="flex cursor-pointer items-start gap-2.5">
        <span className="relative mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
            aria-invalid={!!error}
            className="peer sr-only"
          />
          <span
            className={`grid h-[18px] w-[18px] place-items-center rounded-[5px] border-2 transition-all duration-200 peer-checked:border-teal-700 peer-checked:bg-teal-700 peer-focus-visible:ring-2 peer-focus-visible:ring-teal-500/30 ${
              error && !checked ? 'border-red-400 bg-red-50' : 'border-stone-300 bg-white'
            }`}
          >
            <svg className={`h-3 w-3 text-white transition-opacity ${checked ? 'opacity-100' : 'opacity-0'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </span>
        </span>
        <span className="text-xs leading-relaxed text-stone-500">
          I agree to HUWA's{' '}
          <Link to="/terms" onClick={(e) => e.stopPropagation()} className="font-medium text-stone-700 underline decoration-stone-300 underline-offset-2 transition-colors hover:text-teal-700 hover:decoration-teal-300">
            Terms &amp; Conditions
          </Link>{' '}
          and{' '}
          <Link to="/privacy" onClick={(e) => e.stopPropagation()} className="font-medium text-stone-700 underline decoration-stone-300 underline-offset-2 transition-colors hover:text-teal-700 hover:decoration-teal-300">
            Privacy Policy
          </Link>
          . By continuing, you confirm you're happy to receive order updates on this number.
        </span>
      </label>
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