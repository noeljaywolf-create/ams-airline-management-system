import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { api, getAnonymousId } from '../lib/api';
import { COUNTRIES, findCountry } from '../lib/countries';
import CopyId from '../components/CopyId';

interface OrderBrief {
  id: string;
  orderNumber: string;
  isAssisted: boolean;
}
interface CheckoutResponse {
  order: OrderBrief;
  paymentIntentSecret?: string;
}

export default function Checkout() {
  const { cart, refresh } = useCart();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', phone: '', line1: '', city: '', state: '', postalCode: '', country: 'ZW' });
  const [dial, setDial] = useState(findCountry('ZW').dial);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<OrderBrief | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'whatsapp' | 'bank' | 'ecocash'>('card');
  const [payOpen, setPayOpen] = useState(false);
  const [ecocashNumber, setEcocashNumber] = useState('');

  const payOptions = [
    { id: 'card', title: 'Card', desc: 'Pay securely by card — Visa, Mastercard, Amex' },
    { id: 'ecocash', title: 'EcoCash', desc: 'Pay from your EcoCash wallet — instant, no fees' },
    { id: 'whatsapp', title: 'WhatsApp', desc: 'Confirm on WhatsApp, pay cash on delivery' },
    { id: 'bank', title: 'Bank transfer', desc: 'Pay to our bank account, we confirm within hours' },
  ] as const;
  const selectedPay = payOptions.find((o) => o.id === paymentMethod);

  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh]);

  // Scroll to the top so the confirmation screen is visible right after placing the order.
  useEffect(() => {
    if (done) {
      window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
    }
  }, [done]);

  const validators: Record<string, (v: string) => string | undefined> = {
    name: (v) => (v.trim() ? undefined : 'Please enter your full name.'),
    email: (v) => {
      if (!v.trim()) return 'Please enter your email so we can send order updates.';
      const re = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
      return re.test(v.trim()) ? undefined : 'That email doesn\u2019t look right — please double-check it.';
    },
    phone: (v) => (v.trim() ? undefined : 'Please enter a phone number for delivery updates.'),
    line1: (v) => (v.trim() ? undefined : 'Please enter your street address.'),
    city: (v) => (v.trim() ? undefined : 'Please enter your city.'),
    postalCode: (v) => (v.trim() ? undefined : 'Please enter your postal code.'),
  };

  const submit = async () => {
    setError('');
    const errs: Record<string, string> = {};
    (['name', 'email', 'phone', 'line1', 'city', 'postalCode'] as const).forEach((f) => {
      const m = validators[f]?.(form[f]);
      if (m) errs[f] = m;
    });
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      setError('Please fix the highlighted fields before continuing.');
      return;
    }
    if (paymentMethod === 'ecocash' && !ecocashNumber.trim()) {
      setError('Please enter your EcoCash wallet number so we can send the payment prompt.');
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    const anon = getAnonymousId();
    const payload = { ...form, phone: `${dial} ${form.phone.trim()}`, ecocashNumber: paymentMethod === 'ecocash' ? ecocashNumber.trim() : '' };
    const res = await api.post<CheckoutResponse>(`/checkout?anonymousId=${encodeURIComponent(anon)}`, {
      shippingAddress: payload,
      paymentMethod,
      ecocashNumber: payload.ecocashNumber,
    });
    if (!res.success || !res.data?.order) {
      setError(res.error || 'Checkout failed');
      setSubmitting(false);
      return;
    }
    // Confirm the (dev/mock) payment. In production this would follow the Stripe flow.
    const confirm = await api.post<OrderBrief>(`/checkout/${res.data.order.id}/confirm?anonymousId=${encodeURIComponent(anon)}`, {});
    if (!confirm.success || !confirm.data) {
      setError(confirm.error || 'Payment confirmation failed');
      setSubmitting(false);
      return;
    }
    setDone(confirm.data);
    setSubmitting(false);
  };

  if (done) {
    return (
      <div className="container-page py-16 md:py-24">
        <div className="mx-auto max-w-xl text-center">
          <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-gradient-to-br from-teal-50 to-emerald-100 text-teal-700 ring-1 ring-teal-100">
            <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </div>
          <div className="eyebrow mt-6">Order confirmed</div>
          <h1 className="mt-2 font-display text-3xl font-semibold text-stone-900 md:text-4xl">Your table is on its way.</h1>
          <p className="mt-3 text-stone-500">
            Order number{' '}
            <span className="font-mono font-semibold text-stone-800">{done.orderNumber}</span>
            — keep it handy to track delivery.
          </p>
          {form.phone && (
            <p className="mt-1 text-sm text-teal-700">
              We sent a confirmation to <span className="font-medium">{form.phone}</span>.
            </p>
          )}
          <p className="mt-2 text-sm text-stone-500">
            Paid via{' '}
            <span className="font-medium capitalize text-stone-700">
              {paymentMethod === 'card' ? 'card' : paymentMethod === 'whatsapp' ? 'WhatsApp (cash on delivery)' : paymentMethod === 'ecocash' ? 'EcoCash (mobile money)' : 'bank transfer'}
            </span>
            .
          </p>

          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <CopyId
              value={done.orderNumber}
              label={`Copy ${done.orderNumber}`}
              copiedLabel="✓ Number copied"
              className="btn-secondary"
            />
            <Link to={`/track?order=${encodeURIComponent(done.orderNumber)}`} className="btn-primary">
              Track my order
            </Link>
          </div>
          <button onClick={() => navigate('/')} className="btn-ghost mt-4">Keep shopping</button>
        </div>
      </div>
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className="container-page py-16 md:py-24">
        <div className="mx-auto max-w-xl text-center">
          <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-gradient-to-br from-teal-50 to-emerald-100 text-teal-700 ring-1 ring-teal-100">
            <svg className="h-9 w-9" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" /></svg>
          </div>
          <h1 className="mt-6 font-display text-3xl font-semibold text-stone-900">Nothing to check out</h1>
          <p className="mt-2 text-stone-500">Your cart is empty — add some favourite pieces first.</p>
          <Link to="/shop" className="btn-gold mt-6">Browse the collection</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container-page py-8 md:py-12">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6">
          <div className="eyebrow">Almost there</div>
          <h1 className="mt-1 font-display text-3xl font-semibold text-stone-900 md:text-4xl">Checkout</h1>
        </div>

        <div className="grid gap-6 md:grid-cols-5">
          <form
            onSubmit={(e) => { e.preventDefault(); submit(); }}
            className="card space-y-4 p-6 md:col-span-3 md:p-8"
          >
            <h2 className="font-display text-lg font-semibold text-stone-900">Shipping details</h2>
            <p className="text-xs text-stone-500">We only use this to deliver your order and send updates.</p>

            {/* Full name */}
            <div>
              <label className="label" htmlFor="co-name">Full name</label>
              <input
                id="co-name"
                value={form.name}
                onChange={(e) => { setForm({ ...form, name: e.target.value }); setFieldErrors((p) => ({ ...p, name: '' })); }}
                placeholder="Jane Doe"
                autoComplete="name"
                className={`input ${fieldErrors.name ? '!border-red-500 !ring-2 !ring-red-500/20' : ''}`}
              />
              {fieldErrors.name && <p className="mt-1 text-xs font-medium text-red-600">{fieldErrors.name}</p>}
            </div>

            {/* Email */}
            <div>
              <label className="label" htmlFor="co-email">Email <span className="text-stone-400">(for order updates)</span></label>
              <input
                id="co-email"
                value={form.email}
                onChange={(e) => { setForm({ ...form, email: e.target.value }); setFieldErrors((p) => ({ ...p, email: '' })); }}
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                className={`input ${fieldErrors.email ? '!border-red-500 !ring-2 !ring-red-500/20' : ''}`}
              />
              {fieldErrors.email && <p className="mt-1 text-xs font-medium text-red-600">{fieldErrors.email}</p>}
            </div>

            {/* Phone with dialing code */}
            <div>
              <label className="label" htmlFor="co-phone">Phone <span className="text-stone-400">(for delivery updates)</span></label>
              <div className="flex gap-2">
                <select
                  aria-label="Country dialing code"
                  value={dial}
                  onChange={(e) => setDial(e.target.value)}
                  className="input w-[6.5rem] shrink-0 !pr-2"
                >
                  {COUNTRIES.filter((c) => ['US', 'GB', 'CA', 'AU', 'NZ', 'ZA', 'KE', 'NG', 'IN', 'AE'].includes(c.code))
                    .concat(COUNTRIES.filter((c) => !['US', 'GB', 'CA', 'AU', 'NZ', 'ZA', 'KE', 'NG', 'IN', 'AE'].includes(c.code)))
                    .map((c) => (
                      <option key={c.code} value={c.dial}>{c.dial}</option>
                    ))}
                </select>
                <input
                  id="co-phone"
                  value={form.phone}
                  onChange={(e) => { setForm({ ...form, phone: e.target.value }); setFieldErrors((p) => ({ ...p, phone: '' })); }}
                  type="tel"
                  autoComplete="tel-national"
                  placeholder="0712 345 678"
                  className={`input ${fieldErrors.phone ? '!border-red-500 !ring-2 !ring-red-500/20' : ''}`}
                />
              </div>
              {fieldErrors.phone && <p className="mt-1 text-xs font-medium text-red-600">{fieldErrors.phone}</p>}
            </div>

            {/* Address */}
            <div>
              <label className="label" htmlFor="co-line1">Street address</label>
              <input
                id="co-line1"
                value={form.line1}
                onChange={(e) => { setForm({ ...form, line1: e.target.value }); setFieldErrors((p) => ({ ...p, line1: '' })); }}
                autoComplete="address-line1"
                placeholder="12 Riverside Avenue"
                className={`input ${fieldErrors.line1 ? '!border-red-500 !ring-2 !ring-red-500/20' : ''}`}
              />
              {fieldErrors.line1 && <p className="mt-1 text-xs font-medium text-red-600">{fieldErrors.line1}</p>}
            </div>

            {/* City / State / Postal */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="co-city">City</label>
                <input
                  id="co-city"
                  value={form.city}
                  onChange={(e) => { setForm({ ...form, city: e.target.value }); setFieldErrors((p) => ({ ...p, city: '' })); }}
                  autoComplete="address-level2"
                  placeholder="Harare"
                  className={`input ${fieldErrors.city ? '!border-red-500 !ring-2 !ring-red-500/20' : ''}`}
                />
                {fieldErrors.city && <p className="mt-1 text-xs font-medium text-red-600">{fieldErrors.city}</p>}
              </div>
              <div>
                <label className="label" htmlFor="co-state">State / Province <span className="text-stone-400">(optional)</span></label>
                <input
                  id="co-state"
                  value={form.state}
                  onChange={(e) => setForm({ ...form, state: e.target.value })}
                  autoComplete="address-level1"
                  className="input"
                />
              </div>
            </div>

            {/* Country + Postal */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="co-country">Country</label>
                <select
                  id="co-country"
                  value={form.country}
                  onChange={(e) => {
                    const c = findCountry(e.target.value);
                    setForm((p) => ({ ...p, country: e.target.value }));
                    setDial(c.dial);
                  }}
                  className="input"
                >
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name} ({c.code}) · {c.dial}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="co-postal">Postal code</label>
                <input
                  id="co-postal"
                  value={form.postalCode}
                  onChange={(e) => { setForm({ ...form, postalCode: e.target.value }); setFieldErrors((p) => ({ ...p, postalCode: '' })); }}
                  autoComplete="postal-code"
                  placeholder="00000"
                  className={`input ${fieldErrors.postalCode ? '!border-red-500 !ring-2 !ring-red-500/20' : ''}`}
                />
                {fieldErrors.postalCode && <p className="mt-1 text-xs font-medium text-red-600">{fieldErrors.postalCode}</p>}
              </div>
            </div>
            <div>
              <button
                type="button"
                onClick={() => setPayOpen((v) => !v)}
                aria-expanded={payOpen}
                className="flex w-full items-center gap-3 rounded-xl border border-stone-200 bg-white p-3.5 text-left transition-all duration-200 hover:border-teal-300 hover:bg-teal-50/40 cursor-pointer"
              >
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-teal-700 text-[11px] font-bold text-white">2</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-stone-800">Select payment option</span>
                  <span className="block text-xs text-stone-500">
                    {selectedPay ? `${selectedPay.title}${paymentMethod === 'ecocash' ? ' — mobile money' : ''}` : 'Choose how you would like to pay'}
                  </span>
                </span>
                <span className="grid shrink-0 place-items-center">
                  <span className="inline-flex items-center gap-2 text-xs font-semibold text-teal-700">
                    <span className="rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1">
                      {payOpen ? 'Hide options' : 'Choose method'}
                    </span>
                    <svg className={`h-4 w-4 transition-transform duration-200 ${payOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                  </span>
                </span>
              </button>

              {payOpen && (
                <div className="mt-3 animate-fade-in">
                  <p className="mb-2 text-xs text-stone-500">Pick the way you'd like to pay — your details stay encrypted end-to-end.</p>
                  <div className="grid gap-2.5">
                    {([
                      { id: 'card', title: 'Card', desc: 'Pay securely by card — Visa, Mastercard, Amex', icon: <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" /></svg> },
                      { id: 'ecocash', title: 'EcoCash', desc: 'Pay from your EcoCash wallet — instant, no fees', icon: <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" /></svg> },
                      { id: 'whatsapp', title: 'WhatsApp', desc: 'Confirm on WhatsApp, pay cash on delivery', icon: <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-1.5-6.4A8.25 8.25 0 107.5 19.65M3.75 16.5l-.525 3.15 3.15-.525a8.274 8.274 0 004.125 1.125c4.56 0 8.25-3.69 8.25-8.25s-3.69-8.25-8.25-8.25c-4.56 0-8.25 3.69-8.25 8.25 0 1.977.695 3.793 1.855 5.25z" /></svg> },
                      { id: 'bank', title: 'Bank transfer', desc: 'Pay to our bank account, we confirm within hours', icon: <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008h-.008v-.008zM12 15h1.5" /></svg> },
                    ] as const).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setPaymentMethod(m.id)}
                        aria-pressed={paymentMethod === m.id}
                        className={`group flex items-start gap-3 rounded-xl border p-3.5 text-left transition-all duration-200 cursor-pointer ${
                          paymentMethod === m.id
                            ? 'border-teal-500 bg-teal-50/60 ring-2 ring-teal-500/20 shadow-sm'
                            : 'border-stone-200 bg-white hover:border-stone-300 hover:bg-stone-50'
                        }`}
                      >
                        <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg transition-colors ${paymentMethod === m.id ? 'bg-teal-700 text-white' : 'bg-stone-100 text-stone-500 group-hover:bg-stone-200'}`}>
                          {m.icon}
                        </span>
                        <span className="min-w-0">
                          <span className={`block text-sm font-semibold ${paymentMethod === m.id ? 'text-teal-900' : 'text-stone-800'}`}>{m.title}</span>
                          <span className="block text-xs text-stone-500">{m.desc}</span>
                        </span>
                        <span className={`ml-auto mt-1.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 transition-all ${paymentMethod === m.id ? 'border-teal-600 bg-teal-600' : 'border-stone-300 bg-white'}`}>
                          {paymentMethod === m.id && <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>}
                        </span>
                      </button>
                    ))}

                    {/* EcoCash wallet number — shown when EcoCash is selected */}
                    {paymentMethod === 'ecocash' && (
                      <div className="rounded-xl border border-teal-200 bg-teal-50/60 p-3.5">
                        <label className="label" htmlFor="co-ecocash">EcoCash wallet number</label>
                        <div className="flex gap-2">
                          <span className="grid shrink-0 place-items-center rounded-xl bg-teal-700 px-3 text-sm font-bold text-white">+263</span>
                          <input
                            id="co-ecocash"
                            value={ecocashNumber}
                            onChange={(e) => setEcocashNumber(e.target.value)}
                            type="tel"
                            autoComplete="tel"
                            inputMode="numeric"
                            placeholder="77 123 4567"
                            className="input"
                          />
                        </div>
                        <p className="mt-1.5 text-[11px] text-teal-700">
                          We'll send a one-time payment prompt to this wallet. Enter the number you registered with EcoCash.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Trust + accepted networks */}
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-dashed border-stone-200 pt-3">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">We accept</span>
                    {['VISA', 'Mastercard', 'AMEX', 'Discover', 'PayPal'].map((n) => (
                      <span key={n} className="rounded-md border border-stone-200 bg-white px-2 py-0.5 text-[10px] font-bold tracking-wide text-stone-600">{n}</span>
                    ))}
                  </div>
                  <p className="mt-2 flex items-center gap-1.5 text-[11px] text-stone-400">
                    <svg className="h-3.5 w-3.5 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>
                    Payments are processed securely and your card details are never stored.
                  </p>
                </div>
              )}
            </div>
            {error && (
              <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
                <svg className="mt-0.5 h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
                {error}
              </div>
            )}
            <button disabled={submitting} className="btn-primary w-full">
              {submitting ? 'Placing order…' : `Place order${cart ? ` · $${cart.subtotal.toFixed(2)}` : ''}`}
            </button>
            <p className="flex items-center justify-center gap-1.5 text-center text-xs text-stone-400">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              By placing your order you agree to our <Link to="/terms" className="text-stone-500 underline">Terms</Link> & <Link to="/privacy" className="text-stone-500 underline">Privacy Policy</Link>.
            </p>
          </form>

          <div className="md:col-span-2">
            <div className="card h-fit p-6 md:p-8">
              <h2 className="font-display text-lg font-semibold text-stone-900 mb-3">Order summary</h2>
              <div className="space-y-2">
                {cart.items.map((i) => (
                  <div key={i.id} className="flex justify-between gap-3 text-sm text-stone-700">
                    <span className="min-w-0 truncate">{i.productTitle} × {i.quantity}</span>
                    <span className="shrink-0 font-medium">${i.lineTotal.toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex justify-between border-t border-stone-200 pt-3 font-semibold text-stone-900">
                <span>Subtotal</span>
                <span>${cart.subtotal.toFixed(2)}</span>
              </div>
              <p className="mt-3 text-xs text-stone-400">Shipping calculated on dispatch. Made-to-order items shown as such.</p>
              <div className="mt-4 flex items-center justify-between rounded-lg bg-stone-50 px-3 py-2 text-sm">
                <span className="text-stone-500">Pay with</span>
                <span className="font-medium capitalize text-stone-800">
                  {paymentMethod === 'card' ? 'Card' : paymentMethod === 'whatsapp' ? 'WhatsApp · Cash on delivery' : paymentMethod === 'ecocash' ? 'EcoCash' : 'Bank transfer'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}