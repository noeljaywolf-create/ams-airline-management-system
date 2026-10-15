import type { ReactNode } from 'react';

interface AuthLayoutProps {
  eyebrow: string;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

const PERKS = [
  {
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48zM12 21a8.25 8.25 0 000-16.5" />
      </svg>
    ),
    label: 'Kiln-fired at 1,860 °C',
  },
  {
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
      </svg>
    ),
    label: 'Dishwasher & microwave safe',
  },
  {
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
    ),
    label: '12-month craft warranty',
  },
  {
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
      </svg>
    ),
    label: 'Free shipping over $75',
  },
];

export default function AuthLayout({ eyebrow, title, subtitle, children, footer }: AuthLayoutProps) {
  return (
    <div className="container-page py-10 md:py-14">
      <div className="mx-auto grid max-w-5xl overflow-hidden rounded-[2rem] border border-stone-200/70 bg-white shadow-[0_2px_12px_rgba(28,25,23,0.06),0_24px_60px_-24px_rgba(28,25,23,0.18)] md:grid-cols-[1.05fr_1fr]">
        {/* Brand panel */}
        <aside className="relative hidden select-none overflow-hidden bg-[#0d120f] p-10 text-white md:flex md:flex-col md:justify-between lg:p-12">
          <div className="pointer-events-none absolute -left-24 top-[-6rem] h-80 w-80 rounded-full bg-teal-500/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-28 -right-20 h-96 w-96 rounded-full bg-champ-500/20 blur-3xl" />
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-[26rem] w-[26rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10" />
          <div className="relative">
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-teal-400 to-emerald-700 text-sm font-bold text-white shadow-lg">H</span>
              <span className="font-display text-lg font-semibold tracking-wide">HUWA TABLE CHARM</span>
            </div>
          </div>

          <div className="relative">
            <div className="eyebrow !text-champ-light">Crafted in small batches</div>
            <h2 className="mt-4 font-display text-3xl font-semibold leading-tight lg:text-4xl">
              A table, set with intention.
            </h2>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/60">
              Ceramics, glassware and serveware made for long dinners, slow mornings and the people you love around them.
            </p>
          </div>

          <div className="relative space-y-3.5 border-t border-white/10 pt-6">
            {PERKS.map((p) => (
              <div key={p.label} className="flex items-center gap-3 text-sm text-white/85">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/5 text-champ-light ring-1 ring-white/10">{p.icon}</span>
                {p.label}
              </div>
            ))}
          </div>
        </aside>

        {/* Form panel */}
        <div className="relative bg-[#fdfbf7] p-7 sm:p-10 lg:p-12">
          <div className="pointer-events-none absolute right-0 top-0 h-40 w-40 rounded-full bg-teal-500/10 blur-3xl" />
          <div className="relative mx-auto max-w-sm">
            <div className="eyebrow">{eyebrow}</div>
            <h1 className="mt-2 font-display text-3xl font-semibold text-stone-900 lg:text-[2.1rem]">{title}</h1>
            {subtitle && <div className="mt-2 text-sm text-stone-500">{subtitle}</div>}
            <div className="mt-7">{children}</div>
            {footer && <div className="mt-6 border-t border-stone-200 pt-5 text-center text-sm text-stone-600">{footer}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}