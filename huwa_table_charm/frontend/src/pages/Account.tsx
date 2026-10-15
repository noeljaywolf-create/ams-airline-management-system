import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { api } from '../lib/api';

interface OrderItem {
  id: string;
  variantId: string;
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

interface Order {
  id: string;
  orderNumber: string;
  state: string;
  items: OrderItem[];
  subtotal: number;
  shipping: number;
  tax: number;
  total: number;
  currency: string;
  isAssisted: boolean;
  createdAt: string;
  updatedAt: string;
  events: OrderEvent[];
}

export default function Account() {
  const { user, loading } = useAuth();
  const { cart } = useCart();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    if (!loading && !user) navigate('/login');
  }, [loading, user, navigate]);

  useEffect(() => {
    if (user) {
      api.get<Order[]>('/orders/mine').then((r) => { if (r.success && r.data) setOrders(r.data); });
    }
  }, [user]);

  if (loading || !user) return <div className="max-w-4xl mx-auto px-4 py-10 text-stone-500">Loading…</div>;

  const stateColors: Record<string, string> = {
    OPEN: 'bg-amber-50 text-amber-800 border-amber-200',
    PAID: 'bg-blue-50 text-blue-800 border-blue-200',
    READY: 'bg-indigo-50 text-indigo-800 border-indigo-200',
    IN_PRODUCTION: 'bg-purple-50 text-purple-800 border-purple-200',
    SHIPPED: 'bg-teal-50 text-teal-800 border-teal-200',
    DELIVERED: 'bg-green-50 text-green-800 border-green-200',
    REFUNDED: 'bg-red-50 text-red-800 border-red-200',
  };

  const stateLabels: Record<string, string> = {
    OPEN: 'Placed', PAID: 'Paid', READY: 'Ready', IN_PRODUCTION: 'In production',
    SHIPPED: 'Shipped', DELIVERED: 'Delivered', REFUNDED: 'Refunded',
  };

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold text-stone-800">Hi, {user.name}</h1>
      <p className="text-stone-500 text-sm mt-1">{user.email} · Roles: {user.roles.join(', ')}</p>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-stone-800 mb-3">Your orders</h2>
        {orders.length === 0 ? (
          <p className="text-stone-500 text-sm">
            No orders yet.{' '}
            <Link to={cart && cart.items.length > 0 ? '/checkout' : '/shop'} className="text-teal-700 font-medium">
              {cart && cart.items.length > 0 ? 'Check out your cart' : 'Start shopping'}
            </Link>
          </p>
        ) : (
          <div className="space-y-4">
            {orders.map((o) => (
              <div key={o.id} className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                <div className="p-4 flex flex-wrap items-center justify-between gap-3 border-b border-stone-100">
                  <div className="flex items-center gap-4">
                    <div>
                      <div className="font-mono font-semibold text-stone-800">{o.orderNumber}</div>
                      <div className="text-xs text-stone-400">{formatDate(o.createdAt)}</div>
                    </div>
                    <span className={`text-xs px-3 py-1 rounded-full border ${stateColors[o.state] ?? 'bg-stone-50 text-stone-600 border-stone-200'}`}>
                      {stateLabels[o.state] ?? o.state}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="font-semibold text-stone-800">${o.total.toFixed(2)}</div>
                      <div className="text-xs text-stone-400">{o.items.length} item{o.items.length !== 1 ? 's' : ''}</div>
                    </div>
                    <Link
                      to={`/track?order=${o.orderNumber}`}
                      className="text-xs bg-teal-700 text-white px-3 py-1.5 rounded-lg hover:bg-teal-800"
                    >
                      Track
                    </Link>
                  </div>
                </div>

                <div className="px-4 py-3">
                  {o.items.map((item) => (
                    <div key={item.id} className="flex justify-between text-sm py-1">
                      <span className="text-stone-700">
                        {item.title}
                        <span className="text-stone-400 ml-1">× {item.quantity}</span>
                        {item.fulfilmentMode === 'make_to_order' && (
                          <span className="text-amber-600 text-xs ml-2">MTO</span>
                        )}
                      </span>
                      <span className="text-stone-600">${item.lineTotal.toFixed(2)}</span>
                    </div>
                  ))}
                  <div className="border-t border-stone-100 mt-2 pt-2 flex justify-between text-xs text-stone-500">
                    <span>Subtotal: ${o.subtotal.toFixed(2)} · Shipping: ${o.shipping.toFixed(2)} · Tax: ${o.tax.toFixed(2)}</span>
                  </div>
                </div>

                {o.events.length > 0 && (
                  <div className="px-4 py-2 bg-stone-50 border-t border-stone-100">
                    <div className="text-xs text-stone-500">
                      Latest: <span className="font-medium">{stateLabels[o.events[o.events.length - 1].toState] ?? o.events[o.events.length - 1].toState}</span>
                      {' · '}
                      {formatDate(o.events[o.events.length - 1].createdAt)}
                      {o.events[o.events.length - 1].note && (
                        <span className="text-stone-400"> — {o.events[o.events.length - 1].note}</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
