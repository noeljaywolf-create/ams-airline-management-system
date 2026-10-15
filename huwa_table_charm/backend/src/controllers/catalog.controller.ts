import type { NextFunction, Request, Response } from 'express';
import * as catalog from '../services/catalog.service';
import { notFound } from '../middleware/errors';
import type { ProductFeature, ProductType } from '@huwa/shared';

export async function publicList(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const features = parseFeatureList(req.query.features);
    const result = await catalog.listProducts({
      productType: req.query.productType as ProductType | undefined,
      category: req.query.category as string | undefined,
      material: req.query.material as string | undefined,
      features,
      maxPrice: req.query.maxPrice ? Number(req.query.maxPrice) : undefined,
      query: req.query.q as string | undefined,
      publishedOnly: true,
      page: req.query.page ? Number(req.query.page) : 1,
      pageSize: req.query.pageSize ? Number(req.query.pageSize) : 24,
    });
    res.json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
}

export async function getProduct(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const slug = req.params.slug;
    const product = await catalog.getProductByIdOrSlug(slug);
    if (!product || !product.published) throw notFound('Product not found');
    const variants = await catalog.listVariants(product.id);
    const bundles = await catalog.listBundles(true);
    const detail = {
      ...product,
      variants,
      bundles: bundles.filter((b) => b.itemIds.some((id) => variants.some((v) => v.id === id))),
    };
    res.json({ success: true, data: detail });
  } catch (e) {
    next(e);
  }
}

export async function listCategories(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const categories = await catalog.listCategories();
    res.json({ success: true, data: categories });
  } catch (e) {
    next(e);
  }
}

export async function listBundles(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const bundles = await catalog.listBundles(true);
    res.json({ success: true, data: bundles });
  } catch (e) {
    next(e);
  }
}

function parseFeatureList(value: unknown): ProductFeature[] | undefined {
  if (!value) return undefined;
  const raw = Array.isArray(value) ? value : [value];
  return raw.map((v) => String(v)).filter((v) =>
    ['induction_compatible', 'microwave_safe', 'dishwasher_safe', 'pfas_free', 'oven_safe'].includes(v),
  ) as ProductFeature[];
}
