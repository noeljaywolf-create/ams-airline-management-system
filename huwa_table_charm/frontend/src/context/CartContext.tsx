import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { api, getAnonymousId } from '../lib/api';

export interface CartItem {
  id: string;
  variantId: string;
  productTitle: string;
  sku: string;
  title: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  image?: string | null;
}

export interface Cart {
  id: string;
  userId: string | null;
  anonymousId: string;
  items: CartItem[];
  subtotal: number;
  itemCount: number;
}

interface CartContextValue {
  cart: Cart | null;
  loading: boolean;
  refresh: () => Promise<void>;
  add: (variantId: string, quantity?: number) => Promise<void>;
  updateQuantity: (itemId: string, quantity: number) => Promise<void>;
  clear: () => Promise<void>;
}

const CartContext = createContext<CartContextValue>({
  cart: null,
  loading: true,
  refresh: async () => {},
  add: async () => {},
  updateQuantity: async () => {},
  clear: async () => {},
});

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const anon = getAnonymousId();
    const res = await api.get<Cart>(`/cart?anonymousId=${encodeURIComponent(anon)}`);
    if (res.success && res.data) setCart(res.data);
    setLoading(false);
  }, []);

  const add = useCallback(async (variantId: string, quantity = 1) => {
    const anon = getAnonymousId();
    const res = await api.post<Cart>(`/cart/items?anonymousId=${encodeURIComponent(anon)}`, { variantId, quantity });
    if (!res.success || !res.data) throw new Error(res.error || 'Could not add this item to your cart');
    setCart(res.data);
  }, []);

  const updateQuantity = useCallback(async (itemId: string, quantity: number) => {
    const res = await api.patch<Cart>(`/cart/items/${itemId}`, { quantity });
    if (res.success && res.data) setCart(res.data);
  }, []);

  const clear = useCallback(async () => {
    const anon = getAnonymousId();
    await api.del(`/cart?anonymousId=${encodeURIComponent(anon)}`);
    await refresh();
  }, [refresh]);

  return (
    <CartContext.Provider value={{ cart, loading, refresh, add, updateQuantity, clear }}>
      {children}
    </CartContext.Provider>
  );
}

export const useCart = () => useContext(CartContext);
