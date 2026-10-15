import { useRef } from 'react';
import type { Product } from '../lib/types';
import ProductCard from './ProductCard';

export default function ProductRail({ products }: { products: Product[] }) {
  const trackRef = useRef<HTMLDivElement>(null);

  const scrollBy = (dir: number) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.7, behavior: 'smooth' });
  };

  if (products.length === 0) return null;

  return (
    <div className="relative">
      <div
        ref={trackRef}
        className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth px-4 sm:-mx-6 sm:gap-5 sm:px-6 lg:-mx-8 lg:px-8"
      >
        {products.map((p) => (
          <div key={p.id} className="w-[70%] shrink-0 snap-start sm:w-[46%] md:w-[31.5%] lg:w-[24%]">
            <ProductCard product={p} className="h-full" />
          </div>
        ))}
      </div>

      <button
        onClick={() => scrollBy(-1)}
        aria-label="Scroll products left"
        className="absolute -left-3 top-[42%] z-10 hidden h-11 w-11 cursor-pointer place-items-center rounded-full border border-stone-200 bg-white/90 text-stone-700 shadow-lift backdrop-blur transition hover:bg-white hover:text-teal-700 sm:grid"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
      </button>
      <button
        onClick={() => scrollBy(1)}
        aria-label="Scroll products right"
        className="absolute -right-3 top-[42%] z-10 hidden h-11 w-11 cursor-pointer place-items-center rounded-full border border-stone-200 bg-white/90 text-stone-700 shadow-lift backdrop-blur transition hover:bg-white hover:text-teal-700 sm:grid"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
      </button>
    </div>
  );
}