export interface Product {
  id: string;
  type: string;
  title: string;
  slug: string;
  description: string;
  categoryId?: string;
  material: string;
  features: Record<string, boolean | number>;
  images: string[];
  tags: string[];
  published: boolean;
  created_at: string;
  price?: number | null;
  compareAtPrice?: number | null;
  defaultVariantId?: string | null;
}

export interface Variant {
  id: string;
  productId: string;
  sku: string;
  title: string;
  options: Record<string, string>;
  price: number;
  compareAtPrice?: number | null;
  stock: number;
  leadTimeDays: number;
  weightKg: number;
  widthCm: number;
  heightCm: number;
  depthCm: number;
  fulfilmentMode: 'stocked' | 'make_to_order';
  isEngravable: boolean;
  image?: string | null;
}

export interface ProductDetail extends Product {
  variants: Variant[];
  bundles: Bundle[];
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  title?: string;
  description?: string;
  image?: string | null;
}

export interface Bundle {
  id: string;
  name: string;
  slug: string;
  description?: string;
  priceType: 'fixed' | 'itemized';
  discountPct: number;
  itemIds: string[];
  items?: BundleItem[];
}

export interface BundleItem {
  id: string;
  productId: string;
  variantId: string;
  quantity: number;
  productTitle?: string;
}

export interface ListResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
