import { useCallback, useEffect, useRef, useState } from 'react';

export interface CarouselProps {
  children: React.ReactNode[];
  className?: string;
  interval?: number;
  showArrows?: boolean;
  showDots?: boolean;
  label?: string;
}

export default function Carousel({
  children,
  className = '',
  interval = 6500,
  showArrows = true,
  showDots = true,
  label = 'Slideshow',
}: CarouselProps) {
  const count = children.length;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchX = useRef<number | null>(null);

  const go = useCallback((dir: number) => setIndex((i) => (i + dir + count) % count), [count]);
  const goTo = useCallback((i: number) => setIndex(((i % count) + count) % count), [count]);
  const next = useCallback(() => go(1), [go]);
  const prev = useCallback(() => go(-1), [go]);

  useEffect(() => {
    if (paused || count <= 1) return;
    const t = setInterval(next, interval);
    return () => clearInterval(t);
  }, [paused, count, next, interval]);

  if (count === 0) return null;

  return (
    <div
      className={`group relative overflow-hidden ${className}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={(e) => {
        touchX.current = e.touches[0].clientX;
      }}
      onTouchEnd={(e) => {
        if (touchX.current == null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        if (Math.abs(dx) > 48) (dx < 0 ? next : prev)();
        touchX.current = null;
      }}
      role="group"
      aria-label={label}
    >
      {children.map((child, i) => (
        <div
          key={i}
          aria-hidden={i !== index}
          className={`absolute inset-0 transition-opacity duration-700 ease-out ${
            i === index ? 'z-10 opacity-100' : 'pointer-events-none z-0 opacity-0'
          }`}
        >
          {child}
        </div>
      ))}

      {showArrows && count > 1 && (
        <>
          <button
            onClick={prev}
            aria-label="Previous slide"
            className="absolute left-3 top-1/2 z-20 grid h-10 w-10 -translate-y-1/2 cursor-pointer place-items-center rounded-full border border-white/25 bg-white/10 text-white opacity-80 backdrop-blur transition hover:bg-white/25 hover:opacity-100 md:left-6 md:h-12 md:w-12"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
          </button>
          <button
            onClick={next}
            aria-label="Next slide"
            className="absolute right-3 top-1/2 z-20 grid h-10 w-10 -translate-y-1/2 cursor-pointer place-items-center rounded-full border border-white/25 bg-white/10 text-white opacity-80 backdrop-blur transition hover:bg-white/25 hover:opacity-100 md:right-6 md:h-12 md:w-12"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
          </button>
        </>
      )}

      {showDots && count > 1 && (
        <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 md:left-6 md:translate-x-0">
          {children.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              aria-label={`Go to slide ${i + 1}`}
              aria-current={i === index}
              className={`h-1.5 cursor-pointer rounded-full transition-all duration-300 ${
                i === index ? 'w-8 bg-amber-300' : 'w-2.5 bg-white/40 hover:bg-white/75'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}