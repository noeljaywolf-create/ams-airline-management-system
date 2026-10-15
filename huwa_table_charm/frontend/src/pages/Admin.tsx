import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import CopyId from '../components/CopyId';

interface Stats {
  totalProducts: number;
  totalOrders: number;
  totalRevenueCents: number;
  lowStockAlerts: number;
}

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

interface OrderRow {
  id: string;
  orderNumber: string;
  state: string;
  items: OrderItem[];
  subtotal: number;
  shipping: number;
  tax: number;
  total: number;
  isAssisted: boolean;
  createdAt: string;
  updatedAt: string;
  events: OrderEvent[];
}

interface ProductRow {
  id: string;
  title: string;
  slug: string;
  type: string;
  published: boolean;
  created_at: string;
}

interface AlertRow {
  variantId: string;
  sku: string;
  onHand: number;
  reorderPoint: number;
}

type Tab = 'stats' | 'products' | 'orders' | 'stock';

export default function Admin() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('stats');
  const [stats, setStats] = useState<Stats | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);

  useEffect(() => {
    if (!isAdmin) navigate('/');
  }, [isAdmin, navigate]);

  useEffect(() => { if (isAdmin && tab === 'stats') loadStats(); }, [tab, isAdmin]);
  useEffect(() => { if (isAdmin && tab === 'orders') loadOrders(); }, [tab, isAdmin]);
  useEffect(() => { if (isAdmin && tab === 'products') loadProducts(); }, [tab, isAdmin]);
  useEffect(() => { if (isAdmin && tab === 'stock') loadStock(); }, [tab, isAdmin]);

  async function loadStats() {
    const r = await api.get<Stats>('/admin/stats');
    if (r.success && r.data) setStats(r.data);
  }
  async function loadOrders() {
    const r = await api.get<{ items: OrderRow[] }>('/admin/orders');
    if (r.success && r.data) setOrders(r.data.items);
  }
  async function loadProducts() {
    const r = await api.get<{ items: ProductRow[] }>('/admin/products?pageSize=100');
    if (r.success && r.data) setProducts(r.data.items);
  }
  async function loadStock() {
    const r = await api.get<AlertRow[]>('/admin/stock/alerts');
    if (r.success && r.data) setAlerts(r.data);
  }

  function advanceOrder(id: string, to: string) {
    api.patch(`/admin/orders/${id}/state`, { toState: to }).then(loadOrders);
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: 'stats', label: 'Overview' },
    { key: 'orders', label: 'Orders' },
    { key: 'products', label: 'Products' },
    { key: 'stock', label: 'Stock' },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold text-stone-800 mb-6">Admin dashboard</h1>

      <div className="flex gap-1 border-b border-stone-200 mb-6">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t.key ? 'border-teal-700 text-teal-700' : 'border-transparent text-stone-500 hover:text-stone-700'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'stats' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card label="Products" value={String(stats?.totalProducts ?? 0)} />
          <Card label="Orders" value={String(stats?.totalOrders ?? 0)} />
          <Card label="Revenue" value={`$${((stats?.totalRevenueCents ?? 0) / 100).toFixed(2)}`} />
          <Card label="Low stock" value={String(stats?.lowStockAlerts ?? 0)} />
        </div>
      )}

      {tab === 'orders' && (
        <div className="space-y-4">
          {orders.length === 0 && <p className="text-stone-500 text-sm">No orders yet.</p>}
          {orders.map((o) => (
            <div key={o.id} className="bg-white border border-stone-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 bg-stone-50">
                <div className="flex items-center gap-4">
                  <CopyId value={o.orderNumber} label={o.orderNumber} />
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    o.state === 'OPEN' ? 'bg-amber-50 text-amber-800' :
                    o.state === 'PAID' ? 'bg-blue-50 text-blue-800' :
                    o.state === 'SHIPPED' ? 'bg-teal-50 text-teal-800' :
                    o.state === 'DELIVERED' ? 'bg-green-50 text-green-800' :
                    'bg-stone-100 text-stone-600'
                  }`}>{o.state}</span>
                  {o.isAssisted && <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full border border-purple-200">✦ Assisted</span>}
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="font-semibold text-stone-800">${o.total.toFixed(2)}</div>
                    <div className="text-xs text-stone-400">{o.items.length} item{o.items.length !== 1 ? 's' : ''}</div>
                  </div>
                  <Link to={`/track?order=${o.orderNumber}`} className="text-xs bg-stone-100 text-stone-600 px-3 py-1.5 rounded-lg hover:bg-stone-200">Track</Link>
                  <div className="flex gap-1">
                    {o.state === 'OPEN' && <ActionBtn label="Pay" onClick={() => advanceOrder(o.id, 'PAID')} />}
                    {o.state === 'PAID' && <ActionBtn label="To ready" onClick={() => advanceOrder(o.id, 'READY')} />}
                    {o.state === 'READY' && <ActionBtn label="Ship" onClick={() => advanceOrder(o.id, 'SHIPPED')} />}
                    {o.state === 'SHIPPED' && <ActionBtn label="Deliver" onClick={() => advanceOrder(o.id, 'DELIVERED')} />}
                    {o.state === 'DELIVERED' && <span className="text-stone-400 text-xs">Complete</span>}
                  </div>
                </div>
              </div>
              <div className="px-4 py-2">
                {o.items.map((item) => (
                  <div key={item.id} className="flex justify-between text-sm py-1">
                    <span className="text-stone-700">{item.title} <span className="text-stone-400">× {item.quantity}</span> <span className="text-stone-400 text-xs">({item.sku})</span></span>
                    <span className="text-stone-600">${item.lineTotal.toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <div className="px-4 py-2 bg-stone-50 border-t border-stone-100 text-xs text-stone-400">
                Placed {formatDate(o.createdAt)} · Updated {formatDate(o.updatedAt)}
                {o.events.length > 0 && <span> · Latest: {o.events[o.events.length - 1].toState}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'products' && (
        <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-left text-stone-500">
              <tr>
                <th className="px-4 py-2">Title</th>
                <th className="px-4 py-2">ID</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Slug</th>
                <th className="px-4 py-2">Published</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {products.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-2 font-medium">{p.title}</td>
                  <td className="px-4 py-2"><CopyId value={p.id} label={p.id.slice(0, 8) + '…'} /></td>
                  <td className="px-4 py-2 capitalize">{p.type}</td>
                  <td className="px-4 py-2 font-mono text-stone-500">{p.slug}</td>
                  <td className="px-4 py-2">{p.published ? '✓' : '—'}</td>
                </tr>
              ))}
              {products.length === 0 && <tr><td colSpan={5} className="px-4 py-4 text-stone-500">No products.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'stock' && (
        <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 font-semibold text-stone-700 border-b border-stone-100">Low stock & reorder alerts</div>
          {alerts.length === 0 ? (
            <p className="p-4 text-stone-500 text-sm">All good — no low-stock alerts.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-stone-100">
                {alerts.map((a) => (
                  <tr key={a.variantId}>
                    <td className="px-4 py-2 font-mono text-stone-500">{a.sku}</td>
                    <td className="px-4 py-2 text-amber-700 font-semibold">{a.onHand} left</td>
                    <td className="px-4 py-2 text-stone-500">reorder at {a.reorderPoint}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-stone-200 rounded-xl p-5">
      <div className="text-sm text-stone-500">{label}</div>
      <div className="text-2xl font-bold text-stone-900 mt-1">{value}</div>
    </div>
  );
}

function ActionBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return <button onClick={onClick} className="text-xs bg-teal-700 text-white px-3 py-1.5 rounded-lg hover:bg-teal-800">{label}</button>;
}
