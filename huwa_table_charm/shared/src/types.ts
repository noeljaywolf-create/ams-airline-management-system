import type {
  ProductType,
  FulfilmentMode,
  ProductFeature,
  OrderState,
  UserRole,
} from './domain.js';

// ---------- Catalog DTOs ----------
export interface FeatureFlags {
  induction_compatible: boolean;
  microwave_safe: boolean;
  dishwasher_safe: boolean;
  pfas_free: boolean;
  oven_safe: boolean;
  oven_temp_c?: number | null;
}

export interface ProductDto {
  id: string;
  type: ProductType;
  title: string;
  slug: string;
  description: string;
  category: string;
  material: string;
  features: FeatureFlags;
  images: string[];
  tags: string[];
  published: boolean;
  createdAt: string;
  /** Lowest variant price in dollars, for display on listing cards. */
  price?: number | null;
  /** Lowest variant compare-at price (if any variant is on sale). */
  compareAtPrice?: number | null;
  /** ID of the cheapest/default variant, for quick-add to cart. */
  defaultVariantId?: string | null;
}

export interface VariantDto {
  id: string;
  productId: string;
  sku: string;
  title: string;
  options: Record<string, string>;
  price: number;
  compareAtPrice: number | null;
  stock: number | null; // null for make_to_order
  leadTimeDays: number;
  weightKg: number;
  widthCm: number;
  heightCm: number;
  depthCm: number;
  fulfilmentMode: FulfilmentMode;
  isEngravable: boolean;
  image?: string | null;
}

export interface CategoryDto {
  id: string;
  slug: string;
  title: string;
}

export interface BundleDto {
  id: string;
  slug: string;
  title: string;
  description: string;
  discountPct: number;
  itemIds: string[];
}

// ---------- Cart DTOs ----------
export interface CartItemDto {
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

export interface CartDto {
  id: string;
  userId: string | null;
  anonymousId: string;
  items: CartItemDto[];
  subtotal: number;
  itemCount: number;
}

// ---------- Order DTOs ----------
export interface OrderItemDto {
  id: string;
  variantId: string;
  sku: string;
  title: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  fulfilmentMode: FulfilmentMode;
}

export interface OrderDto {
  id: string;
  orderNumber: string;
  userId: string | null;
  state: OrderState;
  items: OrderItemDto[];
  subtotal: number;
  shipping: number;
  tax: number;
  total: number;
  currency: string;
  shippingAddress: Record<string, string>;
  isAssisted: boolean;
  paymentMethod: 'card' | 'whatsapp' | 'bank' | 'ecocash' | null;
  createdAt: string;
  updatedAt: string;
  events: OrderEventDto[];
}

export interface OrderEventDto {
  id: string;
  orderId: string;
  fromState: OrderState | null;
  toState: OrderState;
  note?: string;
  createdAt: string;
}

export interface ShippingQuote {
  carrier: string;
  service: string;
  priceCents: number;
  currency: string;
  estimatedDays: number;
}

// ---------- Agent DTOs ----------
export interface ProductHit {
  variantId: string;
  productId: string;
  productTitle: string;
  sku: string;
  title: string;
  price: number;
  image?: string | null;
  material: string;
  features: FeatureFlags;
  fulfilmentMode: FulfilmentMode;
  stock: number | null;
  leadTimeDays: number;
}

export interface CompatibilityResult {
  variantId: string;
  productTitle: string;
  matches: {
    induction_compatible: boolean;
    microwave_safe: boolean;
    dishwasher_safe: boolean;
    oven_safe: boolean;
    pfas_free: boolean;
  };
  caveats: string[];
  verdict: string;
}

export interface AssistedOrderSummary {
  orderId: string;
  orderNumber: string;
  total: number;
  assignedAt: string;
}

// ---------- Auth DTOs ----------
export interface AuthUserDto {
  id: string;
  email: string;
  name: string;
  roles: UserRole[];
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Request with optional authenticated user (used across controllers/services)
export interface RequestUser {
  id: string;
  email: string;
  roles: UserRole[];
}
