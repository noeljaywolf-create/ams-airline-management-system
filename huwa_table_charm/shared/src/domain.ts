/**
 * Domain-wide constants and enums shared across backend, agent and frontend.
 * Single source of truth to avoid string drift between the API and the UI/agent.
 */

// Product types in the catalog (drives the flexible catalog model)
export const PRODUCT_TYPES = [
  'cookware',
  'tableware',
  'drinkware',
  'bakeware',
  'flatware',
  'utensils',
  'storage',
  'appliances',
] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

// Fulfilment mode per variant: hybrid inventory model
export const FULFILMENT_MODES = ['stocked', 'make_to_order'] as const;
export type FulfilmentMode = (typeof FULFILMENT_MODES)[number];

// Functional feature flags stored per product/variant and used for faceting + agent grounding
export const PRODUCT_FEATURES = [
  'induction_compatible',
  'microwave_safe',
  'dishwasher_safe',
  'pfas_free',
] as const;
export type ProductFeature = (typeof PRODUCT_FEATURES)[number];

// Order lifecycle state machine (hybrid: IN_PRODUCTION only for make_to_order)
export const ORDER_STATES = [
  'OPEN',
  'PAID',
  'IN_PRODUCTION',
  'READY',
  'SHIPPED',
  'DELIVERED',
  'COMPLETED',
  'CANCELLED',
  'REFUNDED',
  'ON_HOLD',
] as const;
export type OrderState = (typeof ORDER_STATES)[number];

// Allowed transitions per state (guards the state machine)
export const ORDER_TRANSITIONS: Record<OrderState, OrderState[]> = {
  OPEN: ['PAID', 'CANCELLED'],
  PAID: ['IN_PRODUCTION', 'READY', 'REFUNDED', 'ON_HOLD'],
  IN_PRODUCTION: ['READY', 'CANCELLED', 'REFUNDED', 'ON_HOLD'],
  READY: ['SHIPPED', 'ON_HOLD'],
  SHIPPED: ['DELIVERED', 'REFUNDED', 'ON_HOLD'],
  DELIVERED: ['COMPLETED', 'REFUNDED'],
  COMPLETED: ['REFUNDED'],
  CANCELLED: ['REFUNDED'],
  REFUNDED: [],
  ON_HOLD: ['READY', 'CANCELLED', 'REFUNDED'],
};

// User/role roles
export const ROLES = ['customer', 'support', 'merchant', 'admin'] as const;
export type UserRole = (typeof ROLES)[number];

// Currency (single-currency v1; multi-currency later)
export const CURRENCY = 'USD';
