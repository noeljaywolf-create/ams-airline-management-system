import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { ProductImage } from '../components/ProductCard';

export default function CartPage() {
  const { cart, loading, refresh, updateQuantity, clear } = useCart();
  const navigate = useNavigate();

  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh]);

  if (loading)
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 grid place-items-center">
        <div className="animate-pulse space-y-3 w-full">
          <div className="h-8 bg-stone-100 rounded-lg w-40" />
          <div className="h-40 bg-stone-100 rounded-2xl" />
        </div>
      </div>
    );

  if (!cart || cart.items.length === 0)
    return (
      <div className="max-w-4xl mx-auto px-4 py-24 text-center">
        <div className="grid h-20 w-20 mx-auto place-items-center rounded-full bg-gradient-to-br from-teal-50 to-emerald-100 text-teal-700 ring-1 ring-teal-100">
          <svg className="h-9 w-9" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" /></svg>
        </div>
        <h1 className="font-display text-3xl font-semibold text-stone-900 mt-6">Your cart is empty</h1>
        <p className="text-stone-500 mt-2">Add some tableware and serveware to get started.</p>
        <Link to="/shop" className="btn-primary mt-6">Browse products</Link>
      </div>
    );

  const threshold = 75;
  const progress = Math.min(100, (cart.subtotal / threshold) * 100);
  const remaining = threshold - cart.subtotal;
  const isFreeDelivered = cart.subtotal >= threshold;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 md:py-12">
      <div className="mb-6">
        <div className="eyebrow">Your selection</div>
        <h1 className="font-display text-3xl md:text-4xl font-semibold text-stone-900 mt-1">Your cart</h1>
      </div>

      {!isFreeDelivered && (
        <div className="card p-4 mb-6">
          <div className="text-sm text-stone-600">
            Add <span className="font-semibold text-teal-700">${remaining.toFixed(2)}</span> more for <span className="font-semibold">free shipping</span>
          </div>
          <div className="mt-2 h-2 bg-stone-100 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-teal-500 to-emerald-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}
      {isFreeDelivered && (
        <div className="card p-4 mb-6 bg-teal-50 border-teal-200">
          <div className="text-sm font-semibold text-teal-800">🎉 You've unlocked free shipping!</div>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card divide-y divide-stone-100 overflow-hidden">
          {cart.items.map((item) => (
            <div key={item.id} className="flex gap-4 p-4">
              <div className="w-20 h-20 shrink-0 rounded-xl overflow-hidden bg-stone-100">
                <ProductImage src={item.image} alt={item.productTitle} className="w-full h-full" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-stone-800 leading-snug">{item.productTitle}</div>
                <div className="text-sm text-stone-500 mt-0.5">{item.title} · {item.sku}</div>
                <div className="text-sm text-stone-700 mt-1">${item.unitPrice.toFixed(2)} each</div>
              </div>
              <div className="flex flex-col items-end justify-between gap-2">
                <div className="flex items-center border border-stone-300 rounded-xl">
                  <button onClick={() => updateQuantity(item.id, item.quantity - 1)} className="px-3 py-1.5 text-stone-600 hover:bg-stone-50 rounded-l-xl" aria-label="Decrease">−</button>
                  <span className="px-2 w-8 text-center text-sm font-medium">{item.quantity}</span>
                  <button onClick={() => updateQuantity(item.id, item.quantity + 1)} className="px-3 py-1.5 text-stone-600 hover:bg-stone-50 rounded-r-xl" aria-label="Increase">+</button>
                </div>
                <div className="font-semibold text-stone-900">${item.lineTotal.toFixed(2)}</div>
              </div>
            </div>
          ))}
          <div className="p-4">
            <button onClick={clear} className="text-xs text-stone-400 hover:text-red-600 transition font-medium">Clear cart</button>
          </div>
        </div>

        <div className="lg:col-span-1">
          <div className="card p-6 sticky top-24">
            <h2 className="font-display text-xl font-semibold text-stone-900">Order summary</h2>
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between text-stone-600">
                <span>Subtotal</span>
                <span className="font-medium text-stone-900">${cart.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-stone-600">
                <span>Shipping</span>
                <span className="font-semibold text-teal-700">{isFreeDelivered ? 'FREE' : 'Calculated at checkout'}</span>
              </div>
            </div>
            <div className="border-t border-stone-200 mt-4 pt-4 flex justify-between items-baseline">
              <span className="font-semibold text-stone-800">Total</span>
              <span className="font-display text-2xl font-bold text-stone-900">${cart.subtotal.toFixed(2)}</span>
            </div>
            <button onClick={() => navigate('/checkout')} className="btn-primary w-full mt-5">
              Proceed to checkout
            </button>
            <Link to="/shop" className="btn-ghost w-full mt-2">Continue shopping</Link>
            <p className="text-xs text-stone-400 mt-3 text-center">Secure mock checkout · WhatsApp order confirmation</p>
          </div>
        </div>
      </div>
    </div>
  );
}