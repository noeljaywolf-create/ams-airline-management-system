import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getAnonymousId } from '../lib/api';
import { useCart } from '../context/CartContext';

interface ToolResult {
  tool: string;
  success: boolean;
  result: unknown;
}

interface ProductHit {
  variantId: string;
  productId: string;
  productTitle: string;
  title: string;
  price: number;
  stock: number;
  material?: string;
}

interface ChatMsg {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  tools?: ToolResult[];
}

const MAX_MSG = 3;
const SESSION_KEY = `charm_${getAnonymousId()}`;

function renderText(text: string) {
  return text.split('\n').map((line, i) => {
    const clean = line.trim();
    if (clean.startsWith('•') || clean.startsWith('—')) {
      return (
        <div key={i} className="pl-3 relative">
          <span className="absolute left-0">•</span>{line.replace(/^[•—]\s*/, '')}
        </div>
      );
    }
    if (line.startsWith('**')) {
      return <div key={i} className="font-semibold mt-1">{line.replace(/\*\*/g, '')}</div>;
    }
    return <div key={i}>{line}</div>;
  });
}

export default function CharmWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([
    'Find a cast iron dutch oven',
    'Is it dishwasher safe?',
    'Show me bundles',
    'Track order HTC-000001',
  ]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { add, refresh } = useCart();
  const navigate = useNavigate();

  useEffect(() => {
    // Expose open() to the rest of the app (home page CTA, footer).
    (window as unknown as { htc?: { open: () => void } }).htc = { open: () => setOpen(true) };
    return () => {
      delete (window as unknown as { htc?: { open: () => void } }).htc;
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, typing, open]);

  async function send(text: string) {
    const trimmed = (text || input).trim();
    if (!trimmed || typing) return;
    setInput('');
    setMessages((m) => [...m, { id: `u${Date.now()}`, role: 'user', text: trimmed }]);
    setTyping(true);
    try {
      const res = await api.post<{ reply: string; toolCalls: ToolResult[] }>('/agent/chat', {
        message: trimmed,
        sessionKey: SESSION_KEY,
        anonymousId: getAnonymousId(),
      });
      if (res.success && res.data) {
        setMessages((m) => [
          ...m,
          { id: `a${Date.now()}`, role: 'assistant', text: res.data!.reply, tools: res.data!.toolCalls },
        ]);
        adjustSuggestions(trimmed);
        refresh().catch(() => {});
      } else {
        setMessages((m) => [...m, { id: `a${Date.now()}`, role: 'assistant', text: res.error || 'Sorry, something went wrong.' }]);
      }
    } catch {
      setMessages((m) => [...m, { id: `a${Date.now()}`, role: 'assistant', text: 'Sorry, I could not reach the server.' }]);
    } finally {
      setTyping(false);
    }
  }

  function adjustSuggestions(msg: string) {
    const lower = msg.toLowerCase();
    if (lower.includes('dishwasher') || lower.includes('safe') || lower.includes('compatib'))
      setSuggestions(['Find a non-stick pan', 'Show me bundles', 'Track order HTC-000001']);
    else if (lower.includes('bundle') || lower.includes('gift'))
      setSuggestions(['Find a cast iron dutch oven', 'Is it dishwasher safe?', 'Track order HTC-000001']);
    else if (lower.includes('track') || lower.includes('order'))
      setSuggestions(['Find a cast iron dutch oven', 'Is it dishwasher safe?', 'Show me bundles']);
    else
      setSuggestions(['Is it dishwasher safe?', 'Show me bundles', 'Track order HTC-000001']);
  }

  async function addFromChat(variantId: string) {
    await add(variantId, 1);
    await refresh().catch(() => {});
    setMessages((m) => [
      ...m,
      { id: `a${Date.now()}`, role: 'assistant', text: 'Added to your cart. You can keep exploring or head to checkout.' },
    ]);
  }

  function ProductCard({ hit }: { hit: ProductHit }) {
    return (
      <div className="border border-stone-200 rounded-lg p-2 flex items-center justify-between gap-2 bg-white">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-stone-800 truncate">{hit.productTitle}</div>
          <div className="text-xs text-stone-500">{hit.title} · ${hit.price.toFixed(2)}</div>
        </div>
        <button
          onClick={() => addFromChat(hit.variantId)}
          className="shrink-0 bg-teal-700 text-white text-xs px-3 py-1.5 rounded-lg font-medium hover:bg-teal-800"
        >
          Add
        </button>
      </div>
    );
  }

  function ToolBlock({ tools }: { tools: ToolResult[] }) {
    return (
      <div className="mt-2 space-y-2">
        {tools.map((t, i) => {
          if (!t.success) return null;
          if (t.tool === 'product_search') {
            const hits = (t.result as ProductHit[]) || [];
            return (
              <div key={i} className="space-y-2">
                {hits.map((h) => <ProductCard key={h.variantId} hit={h} />)}
              </div>
            );
          }
          if (t.tool === 'cart_add') return null;
          return null;
        })}
      </div>
    );
  }

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-50 bg-teal-700 text-white rounded-full w-16 h-16 shadow-lg flex items-center justify-center text-3xl hover:bg-teal-800 transition"
          aria-label="Open Charm assistant"
          title="Chat with Charm"
        >
          ✦
        </button>
      )}

      {open && (
        <div className="fixed bottom-5 right-5 z-50 w-[380px] max-w-[95vw] h-[560px] bg-white rounded-2xl shadow-2xl border border-stone-200 flex flex-col overflow-hidden">
          <div className="bg-teal-800 text-white px-4 py-3 flex items-center justify-between">
            <div>
              <div className="font-bold">Charm ✦</div>
              <div className="text-xs text-teal-200">Your tableware assistant</div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => navigate('/cart')} className="text-xs bg-teal-700 px-3 py-1.5 rounded-lg hover:bg-teal-600">Cart</button>
              <button onClick={() => setOpen(false)} className="text-teal-200 hover:text-white text-lg leading-none px-1">✕</button>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto chat-scroll p-4 space-y-3 bg-stone-50">
            {messages.length === 0 && (
              <div className="text-sm text-stone-600 bg-white border border-stone-200 rounded-xl p-3">
                Hi! I'm <span className="font-semibold text-teal-700">Charm</span>. Looking for cookware, dinnerware, or a special gift?
                I can recommend products, check if they suit your induction hob or microwave, and add items to your cart.
              </div>
            )}
            {messages.map((m) => (
              <div key={m.id} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${m.role === 'user' ? 'bg-teal-700 text-white rounded-br-sm' : 'bg-white border border-stone-200 rounded-bl-sm text-stone-700'}`}>
                  {renderText(m.text)}
                  {m.tools && <ToolBlock tools={m.tools} />}
                </div>
              </div>
            ))}
            {typing && (
              <div className="flex justify-start">
                <div className="bg-white border border-stone-200 rounded-2xl rounded-bl-sm px-4 py-2 text-sm text-stone-500">Charm is typing…</div>
              </div>
            )}
            {messages.filter((m) => m.role === 'assistant').length >= MAX_MSG && suggestions.length > 0 && (
              <div className="pt-1 space-y-1.5">
                <div className="text-xs text-stone-400 font-medium">Try:</div>
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => send(s)}
                    disabled={typing}
                    className="block text-left w-full bg-white border border-teal-200 text-teal-800 text-xs px-3 py-2 rounded-lg hover:bg-teal-50 disabled:opacity-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => { e.preventDefault(); send(input); }}
            className="border-t border-stone-200 p-3 flex gap-2 bg-white"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about products, compatibility, cart…"
              className="flex-1 border border-stone-300 rounded-lg px-3 py-2 text-sm"
            />
            <button disabled={typing || !input.trim()} className="bg-teal-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
              Send
            </button>
          </form>
        </div>
      )}
    </>
  );
}
