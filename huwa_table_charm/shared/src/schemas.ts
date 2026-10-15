import { z } from 'zod';
import {
  PRODUCT_TYPES,
  FULFILMENT_MODES,
  PRODUCT_FEATURES,
  ORDER_STATES,
} from './domain.js';

// ---------- Auth ----------
export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

// ---------- Catalog ----------
export const productCreateSchema = z.object({
  type: z.enum(PRODUCT_TYPES),
  title: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  description: z.string().min(1),
  category: z.string().min(1),
  material: z.string().min(1),
  features: z.object({
    induction_compatible: z.boolean().default(false),
    microwave_safe: z.boolean().default(false),
    dishwasher_safe: z.boolean().default(false),
    pfas_free: z.boolean().default(false),
    oven_safe: z.boolean().default(false),
    oven_temp_c: z.number().int().positive().nullable().optional(),
  }),
  images: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  published: z.boolean().default(true),
});

export const variantCreateSchema = z.object({
  productId: z.string().min(1),
  sku: z.string().min(1),
  title: z.string().min(1),
  options: z.record(z.string()),
  price: z.number().positive(),
  compareAtPrice: z.number().positive().nullable().optional(),
  stock: z.number().int().nonnegative().nullable(),
  leadTimeDays: z.number().int().nonnegative().default(0),
  weightKg: z.number().positive().default(1),
  widthCm: z.number().positive().default(20),
  heightCm: z.number().positive().default(20),
  depthCm: z.number().positive().default(20),
  fulfilmentMode: z.enum(FULFILMENT_MODES),
  isEngravable: z.boolean().default(false),
  image: z.string().nullable().optional(),
});

// ---------- Cart ----------
export const cartAddSchema = z.object({
  variantId: z.string().min(1),
  quantity: z.number().int().positive().default(1),
});

export const cartUpdateSchema = z.object({
  quantity: z.number().int().nonnegative(),
});

// ---------- Checkout / Order ----------
export const checkoutSchema = z.object({
  shippingAddress: z.object({
    name: z.string().min(1),
    email: z.string().email().optional(),
    phone: z.string().min(1).optional(),
    line1: z.string().min(1),
    line2: z.string().optional(),
    city: z.string().min(1),
    state: z.string().min(1),
    postalCode: z.string().min(1),
    country: z.string().min(2),
  }),
  shippingOption: z.string().optional(),
  isAssisted: z.boolean().optional(),
  paymentMethod: z.enum(['card', 'whatsapp', 'bank', 'ecocash']).optional(),
});

export const orderStateUpdateSchema = z.object({
  toState: z.enum(ORDER_STATES),
  note: z.string().optional(),
});

// ---------- Agent tools ----------
export const agentSearchSchema = z.object({
  query: z.string().optional(),
  category: z.string().optional(),
  productType: z.enum(PRODUCT_TYPES).optional(),
  material: z.string().optional(),
  maxPrice: z.number().positive().optional(),
  features: z.array(z.enum(PRODUCT_FEATURES)).optional(),
  limit: z.number().int().min(1).max(20).default(8),
});

export const compatibilitySchema = z.object({
  variantId: z.string().min(1),
});

export const bundleRecommendSchema = z.object({
  variantId: z.string().optional(),
  occasion: z.string().optional(),
  headcount: z.number().int().positive().optional(),
  limit: z.number().int().min(1).max(5).default(3),
});

export const agentCartSchema = z.object({
  variantId: z.string().min(1),
  quantity: z.number().int().positive().default(1),
});

export const agentTrackSchema = z.object({
  orderNumber: z.string().min(1),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ProductCreateInput = z.infer<typeof productCreateSchema>;
export type VariantCreateInput = z.infer<typeof variantCreateSchema>;
export type CartAddInput = z.infer<typeof cartAddSchema>;
export type CartUpdateInput = z.infer<typeof cartUpdateSchema>;
export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type AgentSearchInput = z.infer<typeof agentSearchSchema>;
