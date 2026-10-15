import { Link } from 'react-router-dom';

const IMG = {
  hero: 'https://images.unsplash.com/photo-1556911220-bff31c812dba?auto=format&fit=crop&w=1600&q=80',
  story: 'https://images.unsplash.com/photo-1482242248426-c4e9fe3a559a?auto=format&fit=crop&w=1200&q=80',
  craft: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?auto=format&fit=crop&w=900&q=80',
  table: 'https://images.unsplash.com/photo-1567016432779-094069958ea5?auto=format&fit=crop&w=1600&q=80',
};

const VALUES = [
  {
    title: 'Built to last',
    body: 'We choose stoneware, porcelain, glass and wood that survive the daily rhythm of a real home — and look better with age.',
  },
  {
    title: 'Honest materials',
    body: 'Food-safe, dishwasher-friendly, PFAS-free. No gimmicks, no greenwash — just materials you can trust on your table.',
  },
  {
    title: 'Guidance, not guesswork',
    body: 'Charm, our AI assistant, learns how you cook and entertain so every recommendation actually fits your life.',
  },
  {
    title: 'Thoughtful service',
    body: 'Free shipping over $75, 14-day returns, and a WhatsApp confirmation on every order — we keep you in the loop.',
  },
];

const STATS = [
  ['22+', 'curated pieces'],
  ['7', 'material categories'],
  ['24h', 'order confirmation'],
  ['100%', 'food-safe materials'],
];

export default function About() {
  const openCharm = () => (window as unknown as { htc?: { open: () => void } }).htc?.open();

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-[#0d120f] text-white">
        <img src={IMG.table} alt="" aria-hidden loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-40" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-black/70" />
        <div className="container-page relative py-24 md:py-32 text-center">
          <span className="badge border border-amber-300/30 bg-amber-300/10 text-amber-200">✦ Our story</span>
          <h1 className="mx-auto mt-5 max-w-3xl font-display text-4xl font-semibold leading-tight sm:text-5xl lg:text-6xl">
            We believe a beautiful table changes how <span className="bg-gradient-to-r from-amber-200 to-yellow-300 bg-clip-text text-transparent italic">people come together.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-stone-200">
            HUWA TABLE CHARM exists to make thoughtful, lasting tableware simple to choose — and beautifully simple to own.
          </p>
        </div>
      </section>

      {/* Story */}
      <section className="container-page py-16 md:py-24">
        <div className="grid items-center gap-10 md:grid-cols-2 md:gap-16">
          <div>
            <img src={IMG.story} alt="A set table at dinner" loading="lazy" className="w-full rounded-3xl object-cover shadow-lift" />
          </div>
          <div className="order-first md:order-last">
            <div className="eyebrow">Why HUWA</div>
            <h2 className="mt-3 font-display text-3xl font-semibold text-stone-900 md:text-4xl">
              The table is the stage. We're here for the cast.
            </h2>
            <div className="mt-5 space-y-4 leading-relaxed text-stone-600">
              <p>
                Every meal — a Tuesday supper, a slow Sunday, a dinner party — is a small performance. The right plate, the
                right glass, the right serving piece turns routine into ritual.
              </p>
              <p>
                So we set out to do something most shops don't bother with: understand how <em>you</em> actually eat,
                cook and entertain, then match you to pieces that fit. Not a wall of options — a considered selection.
              </p>
              <p>
                That's what <strong className="text-teal-700">Charm</strong> is for. It's not a chatbot gimmick; it's a
                personal shopper that knows this catalogue inside out and walks you to the right answer in minutes.
              </p>
            </div>
            <button onClick={openCharm} className="btn-gold mt-7 !px-7 !py-3">
              Meet Charm
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12l-7.5 7.5M21 12H3" /></svg>
            </button>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-y border-stone-200/70 bg-white">
        <div className="container-page grid grid-cols-2 gap-8 py-12 md:grid-cols-4">
          {STATS.map(([num, label]) => (
            <div key={label} className="text-center">
              <div className="font-display text-4xl font-bold text-teal-700 md:text-5xl">{num}</div>
              <div className="mt-1 text-sm text-stone-500">{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Values */}
      <section className="container-page py-16 md:py-24">
        <div className="mb-10 max-w-2xl">
          <div className="eyebrow">What we stand for</div>
          <h2 className="mt-3 font-display text-3xl font-semibold text-stone-900 md:text-4xl">Four promises, kept daily</h2>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {VALUES.map((v) => (
            <div key={v.title} className="card p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-lift">
              <div className="h-1 w-10 rounded-full bg-gradient-to-r from-teal-500 to-emerald-500" />
              <div className="mt-4 font-display text-lg font-semibold text-stone-900">{v.title}</div>
              <div className="mt-2 text-sm leading-relaxed text-stone-600">{v.body}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Craft */}
      <section className="bg-[#0d120f] text-white">
        <div className="container-page grid items-center gap-10 py-16 md:grid-cols-2 md:py-24 md:gap-16">
          <div>
            <img src={IMG.craft} alt="Ceramic vessels" loading="lazy" className="w-full rounded-3xl object-cover shadow-lift" />
          </div>
          <div>
            <div className="eyebrow !text-amber-300">The collection</div>
            <h2 className="mt-3 font-display text-3xl font-semibold md:text-4xl">A considered 22 pieces — not a wall of noise</h2>
            <p className="mt-5 leading-relaxed text-stone-300">
              Dinnerware, cookware, bakeware, glassware, flatware and serveware — each chosen against our own bar for
              durability, food safety and beauty. If a piece doesn't earn its place at the table, it doesn't ship.
            </p>
            <Link to="/shop" className="btn-gold mt-7 !px-7 !py-3">
              Explore the collection
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12l-7.5 7.5M21 12H3" /></svg>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}