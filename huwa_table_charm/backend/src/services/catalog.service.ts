import { v4 as uuid } from 'uuid';
import db from '../config/database';
import {
  toProduct,
  toVariant,
  toBundle,
  toCents,
  parseJson,
  type ProductRow,
  type VariantRow,
  type BundleRow,
} from './catalog.mapper';
import { notFound, conflict, badRequest } from '../middleware/errors';
import type {
  ProductDto,
  VariantDto,
  BundleDto,
  ProductCreateInput,
  VariantCreateInput,
  CategoryDto,
  ProductType,
  ProductFeature,
} from '@huwa/shared';

const isUuid=(value:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
// ---------- Categories ----------
export async function listCategories(): Promise<CategoryDto[]> {
  const rows = await db('categories').select('*').orderBy('title');
  return rows.map((r: any) => ({ id: r.id, slug: r.slug, title: r.title }));
}

export async function createCategory(slug: string, title: string): Promise<CategoryDto> {
  const id = uuid();
  await db('categories').insert({ id, slug, title });
  return { id, slug, title };
}

// ---------- Products ----------
export async function createProduct(input: ProductCreateInput): Promise<ProductDto> {
  const existing = await db('products').where({ slug: input.slug }).first();
  if (existing) throw conflict('Slug already in use');

  // Resolve the category by id or slug (input.category is the CategoryDto id/slug)
  let categoryId = input.category;
  const category = await db('categories').where(isUuid(categoryId)?{id:categoryId}:{slug:categoryId}).first();
  if (!category) throw badRequest('Unknown category');
  categoryId = category.id;

  const id = uuid();
  const row = {
    id,
    type: input.type,
    title: input.title,
    slug: input.slug,
    description: input.description,
    category_id: categoryId,
    material: input.material,
    features: JSON.stringify(input.features),
    images: JSON.stringify(input.images),
    tags: JSON.stringify(input.tags),
    published: input.published,
  };
  await db('products').insert(row);
  const created = await db('products').where({ id }).first();
  return toProduct(created as ProductRow);
}

export async function getProductByIdOrSlug(identifier: string): Promise<ProductDto | null> {
  const row = await db('products')
    .where(isUuid(identifier)?{id:identifier}:{slug:identifier})
    .first();
  return row ? toProduct(row as ProductRow) : null;
}

export async function listProducts(params: {
  productType?: ProductType;
  category?: string;
  material?: string;
  features?: ProductFeature[];
  maxPrice?: number;
  query?: string;
  publishedOnly?: boolean;
  page?: number;
  pageSize?: number;
}): Promise<{ items: ProductDto[]; total: number }> {
  const page = Math.max(1, Math.floor(params.page || 1));
  const pageSize = Math.min(100, Math.max(1, Math.floor(params.pageSize || 24)));

  // Resolve category by slug OR id (the API surface uses slugs; internally category_id is a UUID)
  let categoryId: string | undefined;
  if (params.category) {
    const cat = await db('categories').where(isUuid(params.category)?{id:params.category}:{slug:params.category}).first();
    categoryId = cat?.id;
    if (!categoryId) return { items: [], total: 0 };
  }

  const base = (qb: any) => {
    if (params.publishedOnly) qb.where({ published: true });
    if (params.productType) qb.where({ type: params.productType });
    if (categoryId) qb.where({ category_id: categoryId });
    if (params.material) qb.where({ material: params.material });
    if (params.query) {
      const tokens = params.query.split(/\s+/).map((t) => t.trim()).filter((t) => t.length > 1);
      if (tokens.length > 1) {
        qb.where((inner: any) => {
          for (const tok of tokens) {
            inner.orWhereRaw('LOWER(title) LIKE ?', [`%${tok.toLowerCase()}%`]).orWhereRaw('LOWER(description) LIKE ?', [`%${tok.toLowerCase()}%`]);
          }
        });
      } else if (tokens.length === 1) {
        qb.where((inner:any)=>inner.whereRaw('LOWER(title) LIKE ?', [`%${tokens[0].toLowerCase()}%`]).orWhereRaw('LOWER(description) LIKE ?', [`%${tokens[0].toLowerCase()}%`]));
      }
    }
  };

  const countRow = await db('products').modify(base).count('* as c').first();
  let total = Number(countRow?.c ?? 0);

  let rows = await db('products')
    .modify(base)
    .orderByRaw('ROW_NUMBER() OVER (PARTITION BY category_id ORDER BY created_at DESC, title ASC)')
    .orderBy('title', 'asc')
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  // Apply feature/price filtering at the product level if requested
  if ((params.features && params.features.length) || params.maxPrice != null) {
    const filtered: typeof rows = [];
    for (const row of rows) {
      const p = toProduct(row as ProductRow);
      let ok = true;
      if (params.features?.length) {
        for (const f of params.features) {
          if (!(p.features as any)[f]) { ok = false; break; }
        }
      }
      if (ok && params.maxPrice != null) {
        const minPrice = await variantMinPrice(p.id);
        if (minPrice == null || minPrice > params.maxPrice) ok = false;
      }
      if (ok) filtered.push(row);
    }
    total = filtered.length;
    rows = filtered;
  }

  return { items: await enrichWithPrices(rows), total };
}

/** Attach the lowest variant price (and compare-at price) to each product for listing display. */
async function enrichWithPrices(rows: ProductRow[]): Promise<ProductDto[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const variantRows: { id: string; product_id: string; price_cents: number; compare_at_price_cents: number | null }[] =
    await db('variants').whereIn('product_id', ids).select('id', 'product_id', 'price_cents', 'compare_at_price_cents');
  void variantRows;

  const priceRows: { product_id: string; m: number }[] = await db('variants')
    .whereIn('product_id', ids)
    .select('product_id')
    .min('price_cents as m')
    .groupBy('product_id');
  const compareRows: { product_id: string; m: number }[] = await db('variants')
    .whereIn('product_id', ids)
    .whereNotNull('compare_at_price_cents')
    .select('product_id')
    .min('compare_at_price_cents as m')
    .groupBy('product_id');

  const priceBy: Record<string, number> = {};
  for (const r of priceRows) priceBy[r.product_id] = Number(r.m) / 100;
  const compareBy: Record<string, number> = {};
  for (const r of compareRows) compareBy[r.product_id] = Number(r.m) / 100;

  // Cheapest variant id per product (for quick add-to-cart on listing cards)
  const defaultVariantBy: Record<string, string> = {};
  const cheapest = new Map<string, number>();
  for (const v of variantRows) {
    const cur = cheapest.get(v.product_id);
    if (cur == null || v.price_cents < cur) {
      cheapest.set(v.product_id, v.price_cents);
      defaultVariantBy[v.product_id] = v.id;
    }
  }

  return rows.map((r) => toProduct(r, priceBy[r.id] ?? null, compareBy[r.id] ?? null, defaultVariantBy[r.id] ?? null));
}

async function variantMinPrice(productId: string): Promise<number | null> {
  const row = await db('variants').where({ product_id: productId }).min('price_cents as m').first();
  return row?.m == null ? null : Number(row.m) / 100;
}

// ---------- Variants ----------
export async function createVariant(input: VariantCreateInput): Promise<VariantDto> {
  const productId = input.productId;
  const product = await db('products').where({ id: productId }).first();
  if (!product) throw notFound('Product not found');
  if (await db('variants').where({ sku: input.sku }).first()) {
    throw conflict('SKU already in use');
  }

  const id = uuid();
  const row = {
    id,
    product_id: productId,
    sku: input.sku,
    title: input.title,
    options: JSON.stringify(input.options),
    price_cents: toCents(input.price),
    compare_at_price_cents: input.compareAtPrice == null ? null : toCents(input.compareAtPrice),
    stock: input.fulfilmentMode === 'stocked' ? (input.stock ?? 0) : null,
    lead_time_days: input.leadTimeDays,
    weight_kg: input.weightKg,
    width_cm: input.widthCm,
    height_cm: input.heightCm,
    depth_cm: input.depthCm,
    fulfilment_mode: input.fulfilmentMode,
    is_engravable: input.isEngravable,
    image: input.image ?? null,
  };
  await db('variants').insert(row);

  // Seed inventory records for stocked variants
  if (input.fulfilmentMode === 'stocked') {
    await db('inventory_stock').insert({
      id: uuid(),
      variant_id: id,
      on_hand: input.stock ?? 0,
      reserved: 0,
      sellable: input.stock ?? 0,
      reorder_point: 0,
      backorder_allowed: false,
    });
  }

  const created = await db('variants').where({ id }).first();
  return toVariant(created as VariantRow);
}

export async function listVariants(productId: string): Promise<VariantDto[]> {
  const rows = await db('variants').where({ product_id: productId }).orderBy('title');
  return rows.map((r) => toVariant(r as VariantRow));
}

export async function getVariantById(variantId: string): Promise<VariantDto | null> {
  const row = await db('variants').where({ id: variantId }).first();
  return row ? toVariant(row as VariantRow) : null;
}

export async function ensureVariantExists(variantId: string): Promise<VariantDto> {
  const variant = await getVariantById(variantId);
  if (!variant) throw badRequest('Unknown variant');
  return variant;
}

// ---------- Bundles ----------
export async function listBundles(activeOnly = false): Promise<BundleDto[]> {
  const q = db('bundles').modify((query) => {
    if (activeOnly) query.where({ active: true });
  });
  const rows = await q;
  const bundles: BundleDto[] = [];
  for (const row of rows as BundleRow[]) {
    const items = await db('bundle_items').where({ bundle_id: row.id }).select('variant_id');
    bundles.push(toBundle(row, items.map((i: any) => i.variant_id)));
  }
  return bundles;
}

export async function getBundleBySlug(slug: string): Promise<BundleDto | null> {
  const row = await db('bundles').where({ slug }).first();
  if (!row) return null;
  const items = await db('bundle_items').where({ bundle_id: row.id }).select('variant_id');
  return toBundle(row as BundleRow, items.map((i: any) => i.variant_id));
}
