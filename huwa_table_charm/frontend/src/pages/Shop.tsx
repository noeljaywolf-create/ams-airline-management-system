import KitchenRoom from '../components/KitchenRoom';
import catalog from '../lib/tableCharmCatalog.json';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import ProductCard from '../components/ProductCard';
import type { Category, ListResult, Product } from '../lib/types';

const PRODUCT_TYPES = ['cookware', 'tableware', 'drinkware', 'bakeware', 'flatware', 'utensils', 'storage', 'appliances'];
const PAGE_SIZE = 24;

function FilterGroup({ title, options, selected, onSelect }: {
  title: string;
  options: { value: string; label: string }[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="mb-6">
      <div className="text-xs font-semibold uppercase tracking-wide text-stone-400 mb-2">{title}</div>
      <div className="space-y-1">
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => onSelect(o.value)}
            className={`block w-full text-left text-sm px-3 py-1.5 rounded-lg transition ${
              selected === o.value ? 'bg-teal-50 text-teal-800 font-semibold' : 'text-stone-600 hover:bg-stone-100'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Shop() {
  const [params, setParams] = useSearchParams();
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [mobileFilters, setMobileFilters] = useState(false);

  const category = params.get('category') ?? '';
  const q = params.get('q') ?? '';
  const type = params.get('type') ?? '';
  const sort = params.get('sort') ?? '';

  // Track loaded page count locally (backend doesn't echo it back)
  const [loadedPages, setLoadedPages] = useState(0);
  const hasMore = items.length < total;

  useEffect(() => {
    (async () => {
      const c = await api.get<Category[]>('/categories');
      if (c.success && c.data) setCategories(c.data.filter(c=>catalog.some(p=>p.category===c.slug)));
    })();
  }, []);

  // Initial fetch — resets on any filter/search change
  useEffect(() => {
    (async () => {
      setLoading(true);
      setItems([]);
      setTotal(0);
      setLoadedPages(0);
      const query = new URLSearchParams();
      if (category) query.set('category', category);
      if (q) query.set('q', q);
      if (type) query.set('productType', type);
      query.set('pageSize', String(PAGE_SIZE));
      query.set('page', '1');
      const res = await api.get<ListResult<Product>>(`/products?${query.toString()}`);
      if (res.success && res.data) {
        setItems(res.data.items);
        setTotal(res.data.total);
        setLoadedPages(1);
      }
      setLoading(false);
    })();
  }, [category, q, type]);

  const loadMore = async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    const nextPage = loadedPages + 1;
    const query = new URLSearchParams();
    if (category) query.set('category', category);
    if (q) query.set('q', q);
    if (type) query.set('productType', type);
    query.set('pageSize', String(PAGE_SIZE));
    query.set('page', String(nextPage));
    const res = await api.get<ListResult<Product>>(`/products?${query.toString()}`);
    if (res.success && res.data) {
      setItems((prev) => [...prev, ...res.data!.items]);
      setLoadedPages(nextPage);
    }
    setLoadingMore(false);
  };

  // Client-side sort (backend returns newest first; price/sale sort only over current loaded set)
  const sorted = [...items];
  if (sort === 'price-asc') sorted.sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
  else if (sort === 'price-desc') sorted.sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
  else if (sort === 'sale') sorted.sort((a, b) => Number((b.compareAtPrice ?? 0) > 0) - Number((a.compareAtPrice ?? 0) > 0));

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  };

  const filterPanel = (
    <>
      <div className="flex md:hidden items-center justify-between mb-4">
        <span className="font-semibold text-stone-800">Filters</span>
        <button onClick={() => setMobileFilters(false)} className="text-stone-500 p-1" aria-label="Close filters">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
      <FilterGroup
        title="Category"
        options={[{ value: '', label: 'All categories' }, ...categories.map((c) => ({ value: c.slug, label: c.title || c.name }))]}
        selected={category}
        onSelect={(v) => setParam('category', v)}
      />
      <FilterGroup
        title="Type"
        options={[{ value: '', label: 'All types' }, ...PRODUCT_TYPES.map((t) => ({ value: t, label: t[0].toUpperCase() + t.slice(1) }))]}
        selected={type}
        onSelect={(v) => setParam('type', v)}
      />
      <FilterGroup
        title="Sort"
        options={[
          { value: '', label: 'Newest' },
          { value: 'price-asc', label: 'Price: Low to High' },
          { value: 'price-desc', label: 'Price: High to Low' },
          { value: 'sale', label: 'On sale' },
        ]}
        selected={sort}
        onSelect={(v) => setParam('sort', v)}
      />
    </>
  );

  return (
    <>
      {!category && !q && !type && <KitchenRoom compact/>}
      <div className="container-page py-8 md:py-12">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <div className="eyebrow">Collection</div>
          <h1 className="font-display text-3xl md:text-4xl font-semibold text-stone-900 mt-1">
            {category ? categories.find((c) => c.slug === category)?.title ?? categories.find((c) => c.slug === category)?.name ?? 'Shop' : 'The whole kitchen'}
          </h1>
          <p className="text-sm text-stone-500 mt-1.5">
            {loading ? 'Loading…' : items.length === total ? `${total} product${total !== 1 ? 's' : ''}` : `Showing ${items.length} of ${total} product${total !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <form
            onSubmit={(e) => { e.preventDefault(); const v = (e.currentTarget.elements.namedItem('q') as HTMLInputElement).value; setParam('q', v); }}
            className="flex flex-1 gap-2"
          >
            <input
              name="q"
              defaultValue={q}
              placeholder="Search products…"
              className="input"
            />
            <button className="btn-primary !px-3.5 shrink-0" aria-label="Search">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z" /></svg>
            </button>
          </form>
          <button
            onClick={() => setMobileFilters(true)}
            className="md:hidden btn-secondary !px-3.5"
            aria-label="Filters"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 6h9.75m-9.75 0a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 12H7.5m3 6h9.75m-9.75 0a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 18H7.5" /></svg>
          </button>
        </div>
      </div>

      <div className="kitchen-shop-chips" aria-label="Kitchen collections"><button className={!category&&!q?'is-active':''} onClick={()=>setParams({})}>All the lovely things</button>{[{slug:'cookware',name:'Pots & pans'},{slug:'appliances',name:'Kettles & toasters'},{slug:'storage',name:'Colourful storage'},{slug:'serveware',name:'Serve & share'},{slug:'dinnerware',name:'Dinnerware'},{slug:'drinkware',name:'Glassware'},{slug:'flatware',name:'Cutlery'},{slug:'utensils',name:'Kitchen tools'}].map(c=><button key={c.slug} className={category===c.slug?'is-active':''} onClick={()=>setParams({category:c.slug})}>{c.name}</button>)}</div>
      <div className="flex gap-8">
        {/* Desktop sidebar */}
        <aside className="hidden md:block w-56 shrink-0 sticky top-24 self-start max-h-[calc(100vh-120px)] overflow-y-auto pr-2 py-2">
          {filterPanel}
        </aside>

        {/* Mobile filter drawer */}
        {mobileFilters && (
          <div className="fixed inset-0 z-50 md:hidden">
            <div className="absolute inset-0 bg-black/40" onClick={() => setMobileFilters(false)} />
            <div className="absolute right-0 top-0 h-full w-72 bg-white shadow-2xl p-5 overflow-y-auto animate-drawer-in">
              {filterPanel}
            </div>
          </div>
        )}

        <div className="flex-1 min-w-0">
          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="card overflow-hidden">
                  <div className="aspect-square bg-stone-100 animate-pulse" />
                  <div className="p-4 space-y-2">
                    <div className="h-3 bg-stone-100 rounded animate-pulse w-2/3" />
                    <div className="h-3 bg-stone-100 rounded animate-pulse w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : sorted.length === 0 ? (
            <div className="text-center py-24">
              <div className="text-5xl mb-3">🔍</div>
              <p className="text-stone-600 font-medium">No products found</p>
              <p className="text-sm text-stone-400 mt-1">Try adjusting your filters or search.</p>
              <button onClick={() => setParams({})} className="btn-secondary mt-4">Clear filters</button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
                {sorted.map((p, i) => (
                  <ProductCard key={p.id} product={p} index={i} />
                ))}
              </div>

              {hasMore && (
                <div className="mt-10 text-center">
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="btn-secondary inline-flex items-center gap-2 disabled:opacity-50"
                  >
                    {loadingMore ? (
                      <>
                        <span className="h-4 w-4 rounded-full border-2 border-stone-300 border-t-stone-600 animate-spin" />
                        Loading…
                      </>
                    ) : (
                      'Load more'
                    )}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
    </>
  );
}
