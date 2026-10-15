import type { ProductDto, VariantDto, BundleDto, FeatureFlags } from '@huwa/shared';

export interface ProductRow {
  id: string;
  type: string;
  title: string;
  slug: string;
  description: string;
  category_id: string | null;
  material: string;
  features: unknown; // JSON string (sqlite) or object (pg) or already-object
  images: unknown;
  tags: unknown;
  published: boolean;
  created_at: string;
}

export interface VariantRow {
  id: string;
  product_id: string;
  sku: string;
  title: string;
  options: unknown;
  price_cents: number;
  compare_at_price_cents: number | null;
  stock: number | null;
  lead_time_days: number;
  weight_kg: number;
  width_cm: number;
  height_cm: number;
  depth_cm: number;
  fulfilment_mode: string;
  is_engravable: boolean;
  image: string | null;
}

// SQLite stores JSON as text; Postgres via JSONB returns objects. Normalise both.
export function parseJson<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value === 'object') return value as T;
  try {
    return JSON.parse(value as string) as T;
  } catch {
    return fallback;
  }
}

const defaultFeatures: FeatureFlags = {
  induction_compatible: false,
  microwave_safe: false,
  dishwasher_safe: false,
  pfas_free: false,
  oven_safe: false,
  oven_temp_c: null,
};

export const toProduct = (
  row: ProductRow,
  price?: number | null,
  compareAtPrice?: number | null,
  defaultVariantId?: string | null,
): ProductDto => ({
  id: row.id,
  type: row.type as ProductDto['type'],
  title: row.title,
  slug: row.slug,
  description: row.description,
  category: row.category_id ?? '',
  material: row.material,
  features: { ...defaultFeatures, ...parseJson(row.features, {}) },
  images: parseJson<string[]>(row.images, []),
  tags: parseJson<string[]>(row.tags, []),
  published: Boolean(row.published),
  createdAt: row.created_at,
  price: price ?? null,
  compareAtPrice: compareAtPrice ?? null,
  defaultVariantId: defaultVariantId ?? null,
});

export const toVariant = (row: VariantRow): VariantDto => ({
  id: row.id,
  productId: row.product_id,
  sku: row.sku,
  title: row.title,
  options: parseJson<Record<string, string>>(row.options, {}),
  price: cents(row.price_cents),
  compareAtPrice: row.compare_at_price_cents == null ? null : cents(row.compare_at_price_cents),
  stock: row.stock,
  leadTimeDays: row.lead_time_days,
  weightKg: Number(row.weight_kg),
  widthCm: Number(row.width_cm),
  heightCm: Number(row.height_cm),
  depthCm: Number(row.depth_cm),
  fulfilmentMode: row.fulfilment_mode as VariantDto['fulfilmentMode'],
  isEngravable: Boolean(row.is_engravable),
  image: row.image,
});

export function toCents(price: number): number {
  return Math.round(price * 100);
}
export function cents(amountCents: number): number {
  return amountCents / 100;
}

export interface BundleRow {
  id: string;
  slug: string;
  title: string;
  description: string;
  discount_pct: number;
  active: boolean;
}

export const toBundle = (row: BundleRow, itemIds: string[]): BundleDto => ({
  id: row.id,
  slug: row.slug,
  title: row.title,
  description: row.description,
  discountPct: row.discount_pct,
  itemIds,
});
