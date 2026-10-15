import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { api } from '../lib/api';

interface OrderItem {
  id: string;
  sku: string;
  title: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  fulfilmentMode: string;
}

interface OrderEvent {
  id: string;
  fromState: string | null;
  toState: string;
  note: string | null;
  createdAt: string;
}

interface Tracked {
  id: string;
  orderNumber: string;
  state: string;
  items: OrderItem[];
  subtotal: number;
  shipping: number;
  tax: number;
  total: number;
  currency: string;
  shippingAddress: { name?: string; phone?: string; line1?: string; city?: string; state?: string; postalCode?: string };
  isAssisted: boolean;
  paymentMethod: 'card' | 'whatsapp' | 'bank' | 'ecocash' | null;
  createdAt: string;
  updatedAt: string;
  events: OrderEvent[];
}

function StepIcon({ d }: { d: string }) {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

const STEPS = [
  { key: 'OPEN', label: 'Placed', icon: <StepIcon d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 1.83.727 3.476 1.92 4.62-1.19 1.14-1.92 2.79-1.92 4.62 0 2.485 2.099 4.5 4.688 4.5 1.935 0 3.597-1.126 4.312-2.733.715 1.607 2.377 2.733 4.313 2.733 2.589 0 4.688-2.015 4.688-4.5 0-1.83-.727-3.476-1.92-4.62 1.19-1.14 1.92-2.79 1.92-4.62zM12 15.375a1.5 1.5 0 110-3 1.5 1.5 0 010 3z" /> },
  { key: 'PAID', label: 'Paid', icon: <StepIcon d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" /> },
  { key: 'READY', label: 'Ready', icon: <StepIcon d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /> },
  { key: 'IN_PRODUCTION', label: 'In production', icon: <StepIcon d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" /> },
  { key: 'SHIPPED', label: 'Shipped', icon: <StepIcon d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" /> },
  { key: 'DELIVERED', label: 'Delivered', icon: <StepIcon d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" /> },
];

const STATE_LABELS: Record<string, string> = {
  OPEN: 'Placed', PAID: 'Paid', READY: 'Ready', IN_PRODUCTION: 'In production',
  SHIPPED: 'Shipped', DELIVERED: 'Delivered', REFUNDED: 'Refunded',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function TrackOrder() {
  const [searchParams] = useSearchParams();
  const [number, setNumber] = useState(searchParams.get('order') ?? '');
  const [result, setResult] = useState<Tracked | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const value = number.trim();
    if (!value) return;
    setError('');
    setLoading(true);
    const res = await api.get<Tracked>(`/orders/${encodeURIComponent(value)}`);
    setLoading(false);
    if (res.success && res.data) setResult(res.data);
    else setError(res.error || 'Order not found');
  };

  useEffect(() => {
    const fromParam = searchParams.get('order');
    if (fromParam) {
      setNumber(fromParam);
      void (async () => {
        setError('');
        setLoading(true);
        const res = await api.get<Tracked>(`/orders/${encodeURIComponent(fromParam)}`);
        setLoading(false);
        if (res.success && res.data) setResult(res.data);
        else setError(res.error || 'Order not found');
      })();
    }
  }, [searchParams]);

  const currentIdx = result ? STEPS.findIndex((s) => s.key === result.state) : -1;
  const check = <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>;

  return (
    <div className="container-page py-8 md:py-12">
      <div className="mx-auto max-w-2xl">
        <div className="eyebrow">Delivery status</div>
        <h1 className="mt-1 font-display text-3xl font-semibold text-stone-900 md:text-4xl">Track your order</h1>

        <form onSubmit={submit} className="mt-6 flex gap-2">
          <input
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            placeholder="Order number (e.g. HTC-12345)"
            className="input flex-1"
          />
          <button disabled={loading} className="btn-primary shrink-0">
            {loading ? (
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z" /></svg>
            )}
            Track
          </button>
        </form>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        {!result && !error && (
          <p className="mt-3 text-sm text-stone-400">Order numbers are sent to your phone at checkout — e.g. HTC-XXXXX.</p>
        )}

        {result && (
          <div className="mt-8 space-y-6">
            {/* Header */}
            <div className="card p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="font-mono text-lg font-semibold text-stone-900">{result.orderNumber}</span>
                  <div className="mt-0.5 text-xs text-stone-400">Placed {formatDate(result.createdAt)}</div>
                </div>
                <div className="flex items-center gap-2">
                  {result.paymentMethod && (
                    <span className="badge border border-stone-200 bg-white text-stone-600">
                      {result.paymentMethod === 'card' ? 'Card' : result.paymentMethod === 'whatsapp' ? 'WhatsApp · COD' : result.paymentMethod === 'ecocash' ? 'EcoCash' : 'Bank transfer'}
                    </span>
                  )}
                  <span className="badge border border-teal-200 bg-teal-50 text-teal-800">
                    {STATE_LABELS[result.state] ?? result.state}
                  </span>
                </div>
              </div>

              {/* Desktop horizontal progress */}
              <div className="mt-8 hidden sm:block">
                <div className="flex items-center">
                  {STEPS.map((s, i) => (
                    <div key={s.key} className="flex flex-1 items-center last:flex-none">
                      <div className="flex flex-col items-center">
                        <div className={`grid h-11 w-11 place-items-center rounded-full transition ${i <= currentIdx ? 'bg-gradient-to-br from-teal-600 to-emerald-700 text-white shadow-sm' : 'bg-stone-100 text-stone-400 ring-1 ring-stone-200'}`}>
                          {i < currentIdx ? check : s.icon}
                        </div>
                        <span className={`mt-1.5 text-xs ${i <= currentIdx ? 'font-semibold text-stone-800' : 'text-stone-400'}`}>{s.label}</span>
                      </div>
                      {i < STEPS.length - 1 && <div className={`mx-1.5 h-0.5 flex-1 rounded ${i < currentIdx ? 'bg-teal-600' : 'bg-stone-200'}`} />}
                    </div>
                  ))}
                </div>
              </div>

              {/* Mobile vertical timeline */}
              <div className="mt-6 sm:hidden">
                {STEPS.map((s, i) => (
                  <div key={s.key} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${i <= currentIdx ? 'bg-gradient-to-br from-teal-600 to-emerald-700 text-white' : 'bg-stone-100 text-stone-400 ring-1 ring-stone-200'}`}>
                        {i < currentIdx ? check : s.icon}
                      </div>
                      {i < STEPS.length - 1 && <div className={`my-1 w-0.5 flex-1 ${i < currentIdx ? 'bg-teal-600' : 'bg-stone-200'}`} />}
                    </div>
                    <div className={`pt-2 text-sm ${i <= currentIdx ? 'font-semibold text-stone-800' : 'text-stone-400'}`}>
                      {s.label}
                      {i === currentIdx && <span className="badge ml-2 border border-teal-200 bg-teal-50 text-teal-800">Current</span>}
                    </div>
                    <div className="min-h-12 w-px" />
                  </div>
                ))}
              </div>
            </div>

            {/* Items */}
            <div className="card p-6">
              <h2 className="font-display text-lg font-semibold text-stone-900 mb-3">Items</h2>
              {result.items.map((item) => (
                <div key={item.id} className="flex justify-between gap-3 border-b border-stone-50 py-2 text-sm last:border-0">
                  <div className="min-w-0">
                    <span className="font-medium text-stone-700">{item.title}</span>
                    <span className="ml-2 text-stone-400">× {item.quantity}</span>
                    <span className="ml-2 text-xs text-stone-400">({item.sku})</span>
                    {item.fulfilmentMode === 'make_to_order' && (
                      <span className="badge ml-2 bg-amber-50 text-amber-700">Made to order</span>
                    )}
                  </div>
                  <span className="shrink-0 font-medium text-stone-600">${item.lineTotal.toFixed(2)}</span>
                </div>
              ))}
              <div className="mt-3 space-y-1 border-t border-stone-200 pt-3 text-sm">
                <div className="flex justify-between text-stone-500"><span>Subtotal</span><span>${result.subtotal.toFixed(2)}</span></div>
                <div className="flex justify-between text-stone-500"><span>Shipping</span><span>${result.shipping.toFixed(2)}</span></div>
                <div className="flex justify-between text-stone-500"><span>Tax</span><span>${result.tax.toFixed(2)}</span></div>
                <div className="flex justify-between border-t border-stone-100 pt-2 font-semibold text-stone-800"><span>Total</span><span>${result.total.toFixed(2)}</span></div>
              </div>
            </div>

            {/* Timeline */}
            {result.events.length > 0 && (
              <div className="card p-6">
                <h2 className="font-display text-lg font-semibold text-stone-900 mb-4">Order timeline</h2>
                <div className="space-y-3">
                  {[...result.events].reverse().map((ev, i) => (
                    <div key={ev.id} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className={`mt-1 h-3 w-3 rounded-full ${i === 0 ? 'bg-teal-600' : 'bg-stone-300'}`} />
                        {i < result.events.length - 1 && <div className="w-px flex-1 bg-stone-200" />}
                      </div>
                      <div className="pb-3">
                        <div className="text-sm font-medium text-stone-800">
                          {STATE_LABELS[ev.toState] ?? ev.toState}
                          {ev.fromState && <span className="font-normal text-stone-400"> (was {STATE_LABELS[ev.fromState] ?? ev.fromState})</span>}
                        </div>
                        <div className="text-xs text-stone-400">{formatDate(ev.createdAt)}</div>
                        {ev.note && <div className="mt-0.5 text-xs text-stone-500">{ev.note}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Shipping */}
            {result.shippingAddress?.line1 && (
              <div className="card p-6">
                <h2 className="font-display text-lg font-semibold text-stone-900 mb-2">Shipping to</h2>
                <div className="text-sm text-stone-600">
                  <div className="font-medium">{result.shippingAddress.name}</div>
                  <div>{result.shippingAddress.line1}</div>
                  <div>{result.shippingAddress.city}, {result.shippingAddress.state} {result.shippingAddress.postalCode}</div>
                  {result.shippingAddress.phone && <div className="mt-1 text-stone-400">{result.shippingAddress.phone}</div>}
                </div>
                <Link to="/shop" className="btn-ghost mt-4 !px-3">Continue shopping</Link>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}