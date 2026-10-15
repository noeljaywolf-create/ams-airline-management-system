import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import CollectionViewer, { type CharmFinish, type CharmObject } from '../components/CollectionViewer';
import { api, getAnonymousId } from '../lib/api';
import { useCart, type Cart } from '../context/CartContext';
import type { ProductDetail } from '../lib/types';
import '../petal-pearl.css';
const pieces = [
  { type: 'pitcher' as const, slug: 'bloom-carafe', name: 'Bloom Carafe', copy: 'Soft flutes and a generous sculpted loop.' },
  { type: 'cup' as const, slug: 'ribbon-cup', name: 'Ribbon Cup', copy: 'A playful handle for a slower morning.' },
  { type: 'bowl' as const, slug: 'petal-bowl', name: 'Petal Bowl', copy: 'Ten petal contours for small comforts.' },
  { type: 'plate' as const, slug: 'pearl-plate', name: 'Pearl Plate', copy: 'A scalloped edge with champagne detail.' },
];
const finishes: { id: CharmFinish; name: string; color: string }[] = [{ id: 'kiln', name: 'Rose', color: '#d9a6ac' }, { id: 'chalk', name: 'Pearl', color: '#f3e9df' }, { id: 'basalt', name: 'Mulberry', color: '#694451' }, { id: 'sage', name: 'Pistachio', color: '#b8c3a5' }];
export default function PetalPearl() {
  const { add, refresh } = useCart();
  const [object, setObject] = useState<CharmObject>('collection');
  const [finish, setFinish] = useState<CharmFinish>('kiln');
  const [products, setProducts] = useState<Record<string, ProductDetail>>({});
  const [guests, setGuests] = useState(2);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [onlySaved, setOnlySaved] = useState(false);
  const [saved, setSaved] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('htc-petal-wishlist') || '[]'); } catch { return []; } });
  useEffect(() => { let active = true; (async () => { try { const all = await Promise.all(pieces.map(p => api.get<ProductDetail>('/products/' + p.slug))); if (!all.every(r => r.success && r.data)) throw Error('The collection catalog is unavailable.'); if (active) setProducts(Object.fromEntries(pieces.map((p, i) => [p.type, all[i].data!]))); } catch (e) { if (active) setLoadError(e instanceof Error ? e.message : 'Could not load the catalog.'); } })(); return () => { active = false; }; }, []);
  const variant = (type: string) => products[type]?.variants.find(v => v.options.finish === finish);
  const ready = pieces.every(p => !!variant(p.type));
  const total = pieces.reduce((sum, p) => sum + (variant(p.type)?.price || 0) * (p.type === 'pitcher' ? 1 : guests), 0);
  const toggle = (id: string) => setSaved(prev => { const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]; localStorage.setItem('htc-petal-wishlist', JSON.stringify(next)); return next; });
  const addPiece = async (type: string) => { const v = variant(type); if (!v) return; setBusy(true); setMessage(''); try { await add(v.id, 1); setMessage('Added to your HUWA cart.'); } catch (e) { setMessage(e instanceof Error ? e.message : 'Could not add this piece.'); } finally { setBusy(false); } };
  const addSetting = async () => { if (!ready) return; setBusy(true); setMessage(''); try { const res = await api.post<Cart>('/cart/items/batch?anonymousId=' + encodeURIComponent(getAnonymousId()), { items: pieces.map(p => ({ variantId: variant(p.type)!.id, quantity: p.type === 'pitcher' ? 1 : guests })) }); if (!res.success) throw Error(res.error || 'Could not add your table setting.'); await refresh(); setMessage('Your table for ' + guests + ' is in your HUWA cart.'); } catch (e) { setMessage(e instanceof Error ? e.message : 'Could not add your table setting.'); } finally { setBusy(false); } };
  const visible = pieces.filter(p => (!onlySaved || saved.includes(p.type)) && (p.name + ' ' + p.copy).toLowerCase().includes(query.toLowerCase()));
  return <div className="pp pp-page">
    <section className="pp-hero"><div className="pp-intro"><span className="pp-eyebrow">HUWA Table Charm / collection 001</span><h1>Petal &amp;<br /><em>Pearl.</em></h1><p>Little rituals. Lovely company.<br />Scalloped porcelain concepts in four thoughtful glazes.</p><a href="#pp-pieces" className="pp-primary">Find your favourite</a><small>Design preview. Prices are illustrative.</small></div><CollectionViewer object={object} finish={finish} /></section>
    <div className="pp-controls"><div className="pp-tabs" aria-label="Choose a 3D model">{[{ type: 'collection' as const, name: 'Collection' }, ...pieces].map(p => <button key={p.type} aria-pressed={object === p.type} onClick={() => setObject(p.type)}>{p.name}</button>)}</div><div className="pp-swatches" aria-label="Choose a glaze">{finishes.map(f => <button key={f.id} aria-pressed={finish === f.id} onClick={() => setFinish(f.id)}><span style={{ background: f.color }} />{f.name}</button>)}</div></div>
    {loadError && <p className="pp-notice" role="alert">{loadError} The 3D collection remains available.</p>}
    <section id="pp-pieces" className="pp-catalog"><div className="pp-heading"><div><span className="pp-eyebrow">Things to fall in love with</span><h2>Your everyday favourites.</h2></div><div className="pp-search"><label>Find a piece<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search cups, plates, bowls…" /></label><button aria-pressed={onlySaved} onClick={() => setOnlySaved(!onlySaved)}>Saved favourites</button></div></div><div className="pp-grid">{visible.map(p => <article key={p.type}><div className="pp-photo"><img src={'/petal-pearl/' + p.type + '.png'} alt={p.name + ' in Rose'} /><button className="pp-heart" aria-label={'Save ' + p.name} aria-pressed={saved.includes(p.type)} onClick={() => toggle(p.type)}>{saved.includes(p.type) ? '♥' : '♡'}</button></div><h3>{p.name}</h3><p>{p.copy}</p><div className="pp-product-actions"><span>{variant(p.type) ? '$' + variant(p.type)!.price.toFixed(2) : 'Loading price…'}</span><Link to={'/product/' + p.slug}>Details</Link></div><button className="pp-add" disabled={busy || !variant(p.type)} onClick={() => addPiece(p.type)}>Add to cart</button></article>)}</div>{!visible.length && <p>No pieces match your search.</p>}</section>
    <section className="pp-setting"><div><span className="pp-eyebrow">A table that feels like you</span><h2>Who’s coming over?</h2><p>One carafe, with a cup, bowl and plate for each guest.</p></div><div><label>Guests<select value={guests} onChange={e => setGuests(Number(e.target.value))}>{[2, 4, 6, 8].map(n => <option key={n} value={n}>{n} guests</option>)}</select></label><label>Glaze<select value={finish} onChange={e => setFinish(e.target.value as CharmFinish)}>{finishes.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label><p>1 carafe + {guests} cups + {guests} bowls + {guests} plates</p><button className="pp-primary" disabled={busy || !ready} onClick={addSetting}>{busy ? 'Adding…' : 'Add this table to cart'} <span>{ready ? '$' + total.toFixed(2) : 'Loading…'}</span></button></div></section>
    <div className="pp-feedback" role="status" aria-live="polite">{message}{message.includes('cart.') && <Link to="/cart">View cart</Link>}</div>
  </div>;
}
