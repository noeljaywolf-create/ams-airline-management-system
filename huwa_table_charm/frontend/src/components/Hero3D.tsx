import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

export interface Hero3DSlide {
  id: string;
  watermark: string;
  badge: string;
  title: React.ReactNode;
  copy: string | string[];
  meta?: string | string[];
  image: string;
  imageAlt: string;
  chip: string;
  primary: { label: string; to: string };
  secondary: { label: string; onClick: () => void };
  link: { label: string; to: string };
}

interface Hero3DProps {
  slides: Hero3DSlide[];
  label?: string;
  interval?: number;
}

export default function Hero3D({ slides, label = 'Featured collections', interval = 7000 }: Hero3DProps) {
  const count = slides.length;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [autoplayTick, setAutoplayTick] = useState(0);
  const [copyIdx, setCopyIdx] = useState(0);
  const stageRef = useRef<HTMLDivElement>(null);
  const touchX = useRef<number | null>(null);

  const go = useCallback((dir: number) => setIndex((i) => (i + dir + count) % count), [count]);
  const goTo = useCallback((i: number) => setIndex(((i % count) + count) % count), [count]);
  const next = useCallback(() => go(1), [go]);
  const prev = useCallback(() => go(-1), [go]);

  useEffect(() => {
    if (paused || count <= 1) return;
    setAutoplayTick((t) => t + 1);
    const t = setInterval(next, interval);
    return () => clearInterval(t);
  }, [paused, count, next, interval]);

  // Rotate the copy message within the active slide (each iteration is a different message)
  useEffect(() => {
    const s = slides[index];
    const msgs = Array.isArray(s.copy) ? s.copy : [s.copy];
    if (msgs.length <= 1) {
      setCopyIdx(0);
      return;
    }
    setCopyIdx(0);
    const t = setInterval(() => {
      setCopyIdx((i) => (i + 1) % msgs.length);
    }, 5000);
    return () => clearInterval(t);
  }, [index, slides]);

  // Pointer-driven 3D parallax tilt (spring-like, rAF)
  useEffect(() => {
    const el = stageRef.current;
    if (!el || count === 0) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const target = { x: 0, y: 0 };
    const current = { x: 0, y: 0 };
    let raf = 0;

    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      target.x = ((e.clientX - r.left) / r.width - 0.5) * 2;
      target.y = ((e.clientY - r.top) / r.height - 0.5) * 2;
    };
    const onLeave = () => {
      target.x = 0;
      target.y = 0;
    };
    const loop = () => {
      current.x += (target.x - current.x) * 0.055;
      current.y += (target.y - current.y) * 0.055;
      el.style.transform = `rotateY(${(current.x * 8).toFixed(2)}deg) rotateX(${(-current.y * 6).toFixed(2)}deg) translateZ(20px)`;
      raf = requestAnimationFrame(loop);
    };

    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
    };
  }, [count]);

  if (count === 0) return null;

  return (
    <div
      className="group relative h-[600px] overflow-hidden rounded-b-none bg-[#0d120f] sm:h-[620px] lg:h-[680px]"
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
      aria-roledescription="carousel"
      aria-label={label}
    >
      {/* Background video */}
      <video
        className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-75"
        src="/hero-bg.mp4"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        aria-hidden
      />
      {/* Overlay to keep copy readable over the video */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#0d120f]/78 via-[#0d120f]/42 to-[#0d120f]/22" />

      {/* Warm kitchen texture wash */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_70%_at_75%_18%,rgba(232,179,74,0.14),transparent_60%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_60%_at_18%_85%,rgba(181,117,90,0.12),transparent_60%)]" />

      {/* 3D stage */}
      <div className="absolute inset-0" style={{ perspective: '1400px' }} data-hero3d>
        <div ref={stageRef} className="hero3d-stage absolute inset-0">
          {slides.map((s, i) => {
            const active = i === index;
            return (
              <div
                key={s.id}
                aria-hidden={!active}
                className={`hero3d-plane absolute inset-0 transition-all duration-700 ease-out ${active ? 'z-[1] opacity-100' : 'pointer-events-none z-0 opacity-0'}`}
              >
                {/* Watermark depth word */}
                <div className={`hero3d-plane absolute bottom-[-0.18em] left-[3%] select-none whitespace-nowrap font-display text-[26vw] font-bold uppercase leading-none tracking-tight sm:text-[16rem] lg:text-[19rem] ${active ? 'animate-watermark-drift' : ''}`}>
                  <span className="text-stroke" style={{ transform: 'translateZ(-300px)' }}>{s.watermark}</span>
                </div>

                {/* Copy plane */}
                <div className="hero3d-plane absolute inset-0" style={{ transform: 'translateZ(70px)' }}>
                  <div className="container-page flex h-full flex-col items-center justify-center py-16 text-center">
                    <div className="mx-auto max-w-3xl" style={{ pointerEvents: active ? 'auto' : 'none' }}>
                      {/* Eyebrow — thin rules + badge, centered */}
                      <div className={`flex items-center justify-center gap-3 ${active ? 'animate-hero-in' : 'opacity-0'}`} style={{ animationDelay: '0.05s' }}>
                        <span className="h-px w-10 origin-left bg-gradient-to-r from-transparent to-amber-300/80" />
                        <span className="badge border border-amber-300/30 bg-black/30 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-200 backdrop-blur-md">
                          {s.badge}
                        </span>
                        <span className="h-px w-10 origin-right bg-gradient-to-l from-transparent to-amber-300/80" />
                      </div>

                      {/* Headline */}
                      <h1
                        className={`relative mx-auto mt-6 font-display text-[2.75rem] font-medium leading-[1.02] tracking-tight text-white drop-shadow-[0_2px_28px_rgba(0,0,0,0.65)] sm:text-6xl lg:text-[4.6rem] ${active ? 'animate-hero-in' : 'opacity-0'}`}
                        style={{ animationDelay: '0.15s' }}
                      >
                        {s.title}
                        {/* Live shimmer sheen sweeping across the headline */}
                        <span
                          className="pointer-events-none absolute inset-0 z-10 mix-blend-soft-light"
                          style={{
                            background: 'linear-gradient(100deg,transparent 30%,rgba(255,255,255,0.18) 46%,rgba(247,211,123,0.32) 50%,rgba(255,255,255,0.18) 54%,transparent 70%)',
                            backgroundSize: '250% 100%',
                            animation: 'headline-sheen 5s ease-in-out infinite',
                          }}
                        />
                      </h1>

                      {/* Copy — centered, rotates between different messages */}
                      <div className={`mx-auto mt-6 max-w-xl ${active ? 'animate-hero-in' : 'opacity-0'}`} style={{ animationDelay: '0.28s' }}>
                        <p
                          key={`${s.id}-${copyIdx}`}
                          className="min-h-[4.5rem] text-base leading-relaxed text-stone-100/90 sm:text-lg animate-msg-in"
                        >
                          {Array.isArray(s.copy) ? s.copy[copyIdx % s.copy.length] : s.copy}
                        </p>
                      </div>

                      {/* Divider + subtle meta — centered, rotates between different messages */}
                      <div className={`mt-7 flex items-center justify-center gap-3 ${active ? 'animate-hero-in' : 'opacity-0'}`} style={{ animationDelay: '0.38s' }}>
                        <span className="h-px w-14 animate-hero-line origin-right bg-gradient-to-l from-amber-300/50 to-transparent" />
                        <span key={`${s.id}-meta-${copyIdx}`} className="animate-msg-in text-[10px] font-semibold uppercase tracking-[0.24em] text-amber-200/70">
                          {s.meta ? (Array.isArray(s.meta) ? s.meta[copyIdx % s.meta.length] : s.meta) : 'Kiln-fired · Food-safe · Dishwasher safe'}
                        </span>
                        <span className="h-px w-14 animate-hero-line origin-left bg-gradient-to-r from-amber-300/50 to-transparent" />
                      </div>

                      {/* CTAs */}
                      <div className={`mt-8 flex flex-wrap items-center justify-center gap-3 ${active ? 'animate-hero-in' : 'opacity-0'}`} style={{ animationDelay: '0.48s' }}>
                        <Link to={s.primary.to} className="btn-gold !px-8 !py-3.5 !text-base !rounded-full shadow-[0_10px_30px_-8px_rgba(232,179,74,0.6)]">
                          {s.primary.label}
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12l-7.5 7.5M21 12H3" />
                          </svg>
                        </Link>
                        <button
                          onClick={s.secondary.onClick}
                          className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-8 py-3.5 text-base font-semibold text-white backdrop-blur transition-all duration-200 hover:bg-white/10 hover:border-white/35 cursor-pointer"
                        >
                          <svg className="h-5 w-5 text-amber-300" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M9.813 15.904L9.375 18l-.94-2.05a2.25 2.25 0 00-1.015-1.015L5.25 14l2.045-.938A2.25 2.25 0 008.31 12.047l.94-2.05.94 2.05a2.25 2.25 0 001.015 1.015L13.25 14l-2.045.938a2.25 2.25 0 00-1.015 1.015z" />
                            <path d="M19 7.5l-.94-2.05a1.5 1.5 0 00-.677-.677L15.333 3.75l2.05-.94a1.5 1.5 0 00.677-.677L19 .25l.94 2.05a1.5 1.5 0 00.677.677l2.05.94-2.05.94a1.5 1.5 0 00-.677.677L19 7.5z" />
                          </svg>
                          {s.secondary.label}
                        </button>
                      </div>

                      {/* Tertiary link */}
                      <div className={`mt-6 flex justify-center ${active ? 'animate-hero-in' : 'opacity-0'}`} style={{ animationDelay: '0.58s' }}>
                        <Link
                          to={s.link.to}
                          className="inline-flex items-center gap-1.5 text-sm font-medium text-stone-300 underline decoration-stone-600 underline-offset-4 transition-colors duration-200 hover:text-amber-200 hover:decoration-amber-300"
                        >
                          {s.link.label}
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 8.25L21 12m0 0l-3.75 3.75M21 12H3" />
                          </svg>
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom marquee — craft keywords */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 overflow-hidden border-t border-white/10 bg-[#0a0e0c]/55 py-3 backdrop-blur-sm">
        <div className="flex w-max items-center gap-8 whitespace-nowrap animate-marquee">
          {Array.from({ length: 2 }).map((_, k) => (
            <div key={k} className="flex items-center gap-8">
              {['Kiln-Fired Stoneware', 'Hand-Finished Glass', 'Food-Safe Materials', 'Carbon Steel & Cast Iron', 'Sustainable Bamboo', 'Induction Ready', 'Dishwasher Safe', 'Oven Safe'].map((w) => (
                <span key={w} className="flex items-center gap-8 text-[10px] font-semibold uppercase tracking-[0.28em] text-amber-100/50">
                  {w}
                  <span className="h-1 w-1 rounded-full bg-amber-300/50" />
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Arrows */}
      {count > 1 && (
        <>
          <button
            onClick={prev}
            aria-label="Previous slide"
            className="absolute bottom-6 right-20 z-20 grid h-11 w-11 cursor-pointer place-items-center rounded-full border border-white/15 bg-white/5 text-white/90 backdrop-blur transition hover:bg-white/15 md:bottom-8 md:right-24"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
          <button
            onClick={next}
            aria-label="Next slide"
            className="absolute bottom-6 right-6 z-20 grid h-11 w-11 cursor-pointer place-items-center rounded-full border border-white/15 bg-white/5 text-white/90 backdrop-blur transition hover:bg-white/15 md:bottom-8 md:right-10"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </>
      )}

      {/* Progress dots with autoplay fill */}
      {count > 1 && (
        <div className="absolute bottom-8 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 md:bottom-[2.6rem] md:left-auto md:right-[10.5rem] md:translate-x-0">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              aria-label={`Go to slide ${i + 1}`}
              aria-current={i === index}
              className="group/dot relative h-1.5 cursor-pointer overflow-hidden rounded-full transition-all duration-300"
              style={{ width: i === index ? '2.25rem' : '0.625rem' }}
            >
              <span className={`absolute inset-0 rounded-full transition-colors duration-300 ${i === index ? 'bg-white/25' : 'bg-white/35 group-hover/dot:bg-white/70'}`} />
              {i === index && !paused && (
                <span
                  key={`fill-${index}-${autoplayTick}`}
                  className="absolute inset-y-0 left-0 rounded-full bg-amber-300"
                  style={{ animation: `progress-fill ${interval}ms linear forwards` }}
                />
              )}
              {i === index && !paused && (
                <span className="sr-only">Autoplay on</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Autoplay status */}
      <div className="pointer-events-none absolute left-6 top-6 z-20 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">
        <span className={`h-1.5 w-1.5 rounded-full ${paused ? 'bg-stone-400' : 'animate-pulse bg-amber-300'}`} />
        {paused ? 'Paused' : `${String(index + 1).padStart(2, '0')} / ${String(count).padStart(2, '0')}`}
      </div>
    </div>
  );
}