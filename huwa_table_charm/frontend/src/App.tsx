import DreamKitchen from './pages/DreamKitchen';
import {useDreamKitchen} from './context/DreamKitchenContext';
import Kitchen from './pages/Kitchen';
import Inquiries from './pages/Inquiries';
import RequestPrice from './pages/RequestPrice';
import { useState } from 'react';
import { Routes, Route, NavLink, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { useCart } from './context/CartContext';
import Home from './pages/Home';
import PetalPearl from './pages/PetalPearl';
import Shop from './pages/Shop';
import ProductDetail from './pages/ProductDetail';
import CartPage from './pages/CartPage';
import Checkout from './pages/Checkout';
import Login from './pages/Login';
import Register from './pages/Register';
import Account from './pages/Account';
import TrackOrder from './pages/TrackOrder';
import Admin from './pages/Admin';
import About from './pages/About';
import Privacy from './pages/Privacy';
import Terms from './pages/Terms';
import CharmWidget from './components/CharmWidget';

function Logo({ className = '' }: { className?: string }) {
  return (
    <NavLink to="/" className={`flex items-center gap-2 ${className}`}>
      <span className="grid place-items-center w-9 h-9 rounded-xl bg-gradient-to-br from-rose-600 to-rose-700 text-white text-lg shadow-sm">✦</span>
      <span className="font-display font-semibold text-lg text-stone-900 tracking-tight">
        HUWA <span className="text-rose-700">TABLE CHARM</span>
      </span>
      <span className="hidden md:inline-flex items-center text-[10px] font-bold uppercase tracking-widest text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 -ml-1">shop</span>
    </NavLink>
  );
}

function Layout() {
  const { user, isAdmin, logout } = useAuth();
  const {state:dream}=useDreamKitchen();
  const { cart } = useCart();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const count = cart?.itemCount ?? 0;

  // Scroll to top on every route change so you never land on a page
  // showing only the footer (kept scrolled down from the previous page).
  const location = useLocation();
  const [prevPath, setPrevPath] = useState(location.pathname + location.search);
  if (prevPath !== location.pathname + location.search) {
    setPrevPath(location.pathname + location.search);
    requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: 'auto' }));
  }

  const navLink = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-2 rounded-lg text-sm font-medium transition ${isActive ? 'bg-rose-50 text-rose-800' : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'}`;

  const close = () => setMenuOpen(false);

  const navItems = (
    <>
      <NavLink to="/" className={navLink} end onClick={close}>Home</NavLink>
      <NavLink to="/shop" className={navLink} onClick={close}>Shop</NavLink>
      <NavLink to="/kitchen" className={navLink} onClick={close}>Kitchen inspiration</NavLink>
      <NavLink to="/dream-kitchen" className={navLink} onClick={close}>♡ My dream kitchen{dream.saved.length>0?` (${dream.saved.length})`:""}</NavLink>
      {isAdmin && <NavLink to="/admin/inquiries" className={navLink} onClick={close}>Enquiries</NavLink>}
      {isAdmin && <NavLink to="/admin" className={navLink} onClick={close}>Admin</NavLink>}
    </>
  );

  return (
    <div className="min-h-screen flex flex-col bg-warm">
      <header className="bg-white/90 backdrop-blur border-b border-stone-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <Logo />

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems}
            <NavLink to="/cart" className={`relative flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium ${navLink({ isActive: false })}`}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
              </svg>
              Cart
              {count > 0 && (
                <span className="absolute -top-1 -right-1 bg-rose-600 text-white text-xs rounded-full px-1.5 h-5 min-w-5 flex items-center justify-center font-semibold">
                  {count}
                </span>
              )}
            </NavLink>
            {user ? (
              <>
                <NavLink to="/account" className={navLink}>{user.name?.split(' ')[0]}</NavLink>
                <button
                  onClick={async () => { await logout(); navigate('/'); close(); }}
                  className="px-3 py-2 rounded-lg text-sm font-medium text-stone-500 hover:bg-stone-100"
                >
                  Sign out
                </button>
              </>
            ) : (
              <NavLink to="/login" className="ml-1 inline-flex items-center gap-1.5 bg-rose-700 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-rose-800 transition">
                Sign in
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
              </NavLink>
            )}
          </nav>

          {/* Mobile: cart + hamburger */}
          <div className="flex md:hidden items-center gap-2">
            <NavLink to="/cart" className="relative grid place-items-center w-10 h-10 rounded-lg text-stone-700 hover:bg-stone-100">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
              </svg>
              {count > 0 && (
                <span className="absolute top-0 right-0 bg-rose-600 text-white text-[10px] rounded-full px-1.5 h-4.5 min-w-4.5 flex items-center justify-center font-semibold">{count}</span>
              )}
            </NavLink>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="grid place-items-center w-10 h-10 rounded-lg text-stone-700 hover:bg-stone-100"
              aria-label="Menu"
            >
              {menuOpen ? (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              ) : (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" /></svg>
              )}
            </button>
          </div>
        </div>

        {/* Mobile menu drawer */}
        {menuOpen && (
          <div className="md:hidden border-t border-stone-200 animate-drawer-in">
            <nav className="max-w-7xl mx-auto px-4 py-3 flex flex-col gap-1">
              {navItems}
              <NavLink to="/cart" onClick={close} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-stone-600 hover:bg-stone-100">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
                </svg>
                Cart{count > 0 && <span className="ml-auto bg-rose-600 text-white text-xs rounded-full px-2 py-0.5 font-semibold">{count}</span>}
              </NavLink>
              <div className="border-t border-stone-100 my-2" />
              {user ? (
                <>
                  <NavLink to="/account" onClick={close} className="px-3 py-2 rounded-lg text-sm font-medium text-stone-600 hover:bg-stone-100">{user.name ?? 'Account'}</NavLink>
                  <button
                    onClick={async () => { await logout(); navigate('/'); close(); }}
                    className="px-3 py-2 rounded-lg text-sm font-medium text-stone-500 hover:bg-stone-100 text-left"
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <NavLink to="/login" onClick={close} className="px-3 py-2 rounded-lg text-sm font-semibold bg-rose-700 text-white text-center">Sign in</NavLink>
              )}
            </nav>
          </div>
        )}
      </header>

      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/shop" element={<Shop />} />
          <Route path="/kitchen" element={<Kitchen />} />
          <Route path="/dream-kitchen" element={<DreamKitchen />} />
          <Route path="/request-price" element={<RequestPrice />} />
          <Route path="/collection/petal-pearl" element={<PetalPearl />} />
          <Route path="/product/:slug" element={<ProductDetail />} />
          <Route path="/cart" element={<CartPage />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/account" element={<Account />} />
          <Route path="/track" element={<TrackOrder />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/admin/inquiries" element={<Inquiries />} />
          <Route path="/about" element={<About />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
        </Routes>
      </main>

      <footer className="bg-stone-900 text-stone-300 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
          <div className="grid md:grid-cols-2 lg:grid-cols-6 gap-8">
            <div className="md:col-span-2 lg:col-span-3">
              <div className="flex items-center gap-2">
                <span className="grid place-items-center w-9 h-9 rounded-xl bg-gradient-to-br from-rose-600 to-rose-700 text-white text-lg">✦</span>
                <span className="font-display font-semibold text-lg text-white">HUWA TABLE CHARM</span>
              </div>
              <p className="mt-3 text-sm text-stone-400 max-w-sm">
                Thoughtful tableware & serveware for beautiful tables. Built sturdy, made to impress — with Charm, your AI table & kitchen assistant.
              </p>
            </div>
            <div>
              <div className="text-sm font-semibold text-white mb-3">Shop</div>
              <ul className="space-y-2 text-sm text-stone-400">
                <li><Link to="/shop" className="hover:text-white transition">All products</Link></li>
                <li><Link to="/checkout" className="hover:text-white transition">Checkout</Link></li>
                <li><Link to="/track" className="hover:text-white transition">Track an order</Link></li>
              </ul>
            </div>
            <div>
              <div className="text-sm font-semibold text-white mb-3">Company</div>
              <ul className="space-y-2 text-sm text-stone-400">
                <li><Link to="/about" className="hover:text-white transition">Our story</Link></li>
                <li><Link to="/privacy" className="hover:text-white transition">Privacy policy</Link></li>
                <li><Link to="/terms" className="hover:text-white transition">Terms & conditions</Link></li>
              </ul>
            </div>
            <div>
              <div className="text-sm font-semibold text-white mb-3">Support</div>
              <ul className="space-y-2 text-sm text-stone-400">
                <li>Delivery confirmed with your quote</li>
                <li>Ask about returns before ordering</li>
                <li>
                  Need help? Ask{' '}
                  <button onClick={() => (window as unknown as { htc?: { open: () => void } }).htc?.open()} className="text-rose-400 hover:text-rose-300 underline transition">
                    Charm
                  </button>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t border-stone-800 mt-10 pt-6 text-xs text-stone-500 flex flex-col sm:flex-row justify-between gap-2">
            <span>© {new Date().getFullYear()} HUWA TABLE CHARM. All rights reserved.</span>
            <span>Made to simplify your table ✦</span>
          </div>
        </div>
      </footer>

      <CharmWidget />
    </div>
  );
}

export default function App() {
  return <Layout />;
}