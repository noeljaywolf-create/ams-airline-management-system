import { v4 as uuid } from 'uuid';
import db from '../config/database';
import config from '../config';
import * as catalog from './catalog.service';
import * as cartService from './cart.service';
import * as orderService from './order.service';
import type { ProductDto, FeatureFlags, ProductHit, CompatibilityResult, ProductFeature } from '@huwa/shared';

// ---------- Session Management ----------

interface AgentSessionRow {
  id: string;
  session_key: string;
  user_id: string | null;
  anonymous_id: string | null;
  status: string;
}

export async function getOrCreateSession(
  sessionKey: string,
  userId: string | null = null,
  anonymousId: string | null = null,
): Promise<string> {
  const existing = await db('agent_sessions').where({ session_key: sessionKey }).first();
  if (existing) return existing.id;
  const id = uuid();
  await db('agent_sessions').insert({
    id,
    session_key: sessionKey,
    user_id: userId,
    anonymous_id: anonymousId,
    status: 'active',
  });
  return id;
}

// ---------- Message History ----------

export interface AgentMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
}

export async function addMessage(sessionId: string, role: 'user' | 'assistant' | 'tool', content: string): Promise<void> {
  const masked = maskPII(content);
  await db('agent_messages').insert({
    id: uuid(),
    session_id: sessionId,
    role,
    content,
    masked_content: masked,
  });
}

export async function getMessageHistory(sessionId: string, limit = 50): Promise<AgentMessage[]> {
  const rows = await db('agent_messages')
    .where({ session_id: sessionId })
    .orderBy('created_at', 'asc')
    .limit(limit);
  return rows.map((r: any) => ({ role: r.role, content: r.content }));
}

// ---------- PII Masking ----------

function maskPII(text: string): string {
  return text
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]')
    .replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '[CARD]')
    .replace(/\b\d{3}[\s-]?\d{3}[\s-]?\d{4}\b/g, '[PHONE]')
    .replace(/\b\d{1,5}\s+\w+\s+(Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln)\b/gi, '[ADDRESS]');
}

// ---------- Tool Definitions ----------

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export const AGENT_TOOLS: ToolDefinition[] = [
  {
    name: 'product_search',
    description: 'Search the product catalog by keywords, category, material, features, or price range.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Free-text search query' },
        category: { type: 'string', description: 'Category slug (e.g. cookware, dinnerware)' },
        material: { type: 'string', description: 'Material filter (e.g. porcelain, stainless_steel)' },
        features: { type: 'array', items: { type: 'string' }, description: 'Required features (induction_compatible, microwave_safe, dishwasher_safe, pfas_free)' },
        maxPrice: { type: 'number', description: 'Maximum price in USD' },
        limit: { type: 'number', description: 'Max results (default 8)' },
      },
    },
  },
  {
    name: 'compatibility_check',
    description: 'Check whether a product is compatible with a customer\'s kitchen setup (induction hob, microwave, dishwasher, oven).',
    parameters: {
      type: 'object',
      properties: {
        variantId: { type: 'string', description: 'The variant ID to check' },
      },
      required: ['variantId'],
    },
  },
  {
    name: 'bundle_recommend',
    description: 'Recommend product bundles for a given occasion, headcount, or starting product.',
    parameters: {
      type: 'object',
      properties: {
        occasion: { type: 'string', description: 'The occasion (e.g. wedding, housewarming, everyday)' },
        headcount: { type: 'number', description: 'Number of people the set should serve' },
        variantId: { type: 'string', description: 'A starting product to build around' },
        limit: { type: 'number', description: 'Max bundle recommendations (default 3)' },
      },
    },
  },
  {
    name: 'cart_add',
    description: 'Add a product variant to the customer\'s shopping cart.',
    parameters: {
      type: 'object',
      properties: {
        variantId: { type: 'string', description: 'Variant ID to add' },
        quantity: { type: 'number', description: 'Quantity (default 1)' },
      },
      required: ['variantId'],
    },
  },
  {
    name: 'order_track',
    description: 'Look up an order by its order number and return the current status.',
    parameters: {
      type: 'object',
      properties: {
        orderNumber: { type: 'string', description: 'The order number (e.g. HTC-XXXXX)' },
      },
      required: ['orderNumber'],
    },
  },
];

// ---------- Tool Execution ----------

export interface ToolResult {
  tool: string;
  result: unknown;
  success: boolean;
}

export async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  userId: string | null,
  anonymousId: string,
): Promise<ToolResult> {
  try {
    let result: unknown;
    switch (toolName) {
      case 'product_search':
        result = await toolProductSearch(args);
        break;
      case 'compatibility_check':
        result = await toolCompatibilityCheck(args);
        break;
      case 'bundle_recommend':
        result = await toolBundleRecommend(args);
        break;
      case 'cart_add':
        result = await toolCartAdd(args, userId, anonymousId);
        break;
      case 'order_track':
        result = await toolOrderTrack(args);
        break;
      default:
        result = { error: `Unknown tool: ${toolName}` };
        return { tool: toolName, result, success: false };
    }
    return { tool: toolName, result, success: true };
  } catch (e: any) {
    return { tool: toolName, result: { error: e.message }, success: false };
  }
}

async function toolProductSearch(args: Record<string, unknown>): Promise<ProductHit[]> {
  const features = Array.isArray(args.features) ? args.features as ProductFeature[] : undefined;
  const limit = (args.limit as number) ?? 8;

  // Fetch a larger candidate set so we can re-rank by relevance (token matches in titles).
  const { items } = await catalog.listProducts({
    query: args.query as string | undefined,
    category: args.category as string | undefined,
    material: args.material as string | undefined,
    features,
    maxPrice: args.maxPrice as number | undefined,
    publishedOnly: true,
    pageSize: Math.max(limit * 8, 50),
  });

  const tokens = typeof args.query === 'string'
    ? args.query.toLowerCase().split(/\s+/).filter((t) => t.length > 1)
    : [];

  const hits: ProductHit[] = [];
  const scored: Array<{ hit: ProductHit; score: number }> = [];
  for (const p of items) {
    const variants = await catalog.listVariants(p.id);
    for (const v of variants) {
      const hit: ProductHit = {
        variantId: v.id,
        productId: p.id,
        productTitle: p.title,
        sku: v.sku,
        title: v.title,
        price: v.price,
        image: v.image,
        material: p.material,
        features: p.features,
        fulfilmentMode: v.fulfilmentMode,
        stock: v.stock,
        leadTimeDays: v.leadTimeDays,
      };
      let score = 0;
      if (tokens.length) {
        const title = `${p.title} ${v.title} ${p.material}`.toLowerCase();
        for (const tok of tokens) {
          if (title.includes(tok)) score += 1;
        }
      }
      scored.push({ hit, score });
      hits.push(hit);
    }
  }

  if (tokens.length) {
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map((s) => s.hit);
  }
  return hits.slice(0, limit);
}

async function toolCompatibilityCheck(args: Record<string, unknown>): Promise<CompatibilityResult> {
  const variantId = args.variantId as string;
  const variant = await catalog.getVariantById(variantId);
  if (!variant) throw new Error('Variant not found');

  const product = await catalog.getProductByIdOrSlug(variant.productId);
  if (!product) throw new Error('Product not found');

  const features = product.features as FeatureFlags;
  const caveats: string[] = [];

  if (!features.induction_compatible) {
    caveats.push('Not compatible with induction hobs — requires gas or electric hob');
  }
  if (!features.microwave_safe) {
    caveats.push('Not safe for microwave use');
  }
  if (!features.dishwasher_safe) {
    caveats.push('Hand-wash only — not dishwasher safe');
  }
  if (features.oven_safe && features.oven_temp_c) {
    caveats.push(`Oven safe up to ${features.oven_temp_c}°C`);
  }

  const isInduction = features.induction_compatible;
  const isMicrowave = features.microwave_safe;
  const isDishwasher = features.dishwasher_safe;
  const isOven = features.oven_safe;
  const isPfasFree = features.pfas_free;

  let verdict = 'This product meets all tested compatibility criteria.';
  if (!isInduction && !isMicrowave && !isDishwasher) {
    verdict = 'Limited compatibility — requires gas/electric hob and hand washing.';
  } else if (isInduction && isMicrowave && isDishwasher) {
    verdict = 'Excellent compatibility — works with induction, microwave, and dishwasher.';
  }

  return {
    variantId,
    productTitle: product.title,
    matches: {
      induction_compatible: isInduction,
      microwave_safe: isMicrowave,
      dishwasher_safe: isDishwasher,
      oven_safe: isOven,
      pfas_free: isPfasFree,
    },
    caveats,
    verdict,
  };
}

async function toolBundleRecommend(args: Record<string, unknown>): Promise<unknown[]> {
  const bundles = await catalog.listBundles(true);
  return bundles.map((b) => ({
    slug: b.slug,
    title: b.title,
    description: b.description,
    discountPct: b.discountPct,
    itemCount: b.itemIds.length,
  }));
}

async function toolCartAdd(
  args: Record<string, unknown>,
  userId: string | null,
  anonymousId: string,
): Promise<unknown> {
  const variantId = args.variantId as string;
  const quantity = (args.quantity as number) ?? 1;
  const cart = await cartService.addItem(userId, anonymousId, variantId, quantity);
  return { cartId: cart.id, itemCount: cart.itemCount, subtotal: cart.subtotal };
}

async function toolOrderTrack(args: Record<string, unknown>): Promise<unknown> {
  const orderNumber = args.orderNumber as string;
  const order = await orderService.getOrderByNumber(orderNumber);
  if (!order) return { error: 'Order not found' };
  return {
    orderNumber: order.orderNumber,
    state: order.state,
    total: order.total,
    items: order.items.length,
    createdAt: order.createdAt,
  };
}

// ---------- Agent Chat (non-LLM guided flow) ----------

export interface AgentChatRequest {
  sessionKey: string;
  message: string;
  userId?: string;
  anonymousId: string;
}

export interface AgentChatResponse {
  reply: string;
  toolCalls: ToolResult[];
}

/**
 * Process a chat message through the Charm Agent.
 * In v1 without LLM configured, uses a rule-based guided selling flow.
 * With LLM configured, forwards to the LLM with tool-calling support.
 */
export async function chat(req: AgentChatRequest): Promise<AgentChatResponse> {
  const sessionId = await getOrCreateSession(req.sessionKey, req.userId ?? null, req.anonymousId);
  await addMessage(sessionId, 'user', req.message);

  const toolCalls: ToolResult[] = [];
  let reply: string;

  if (config.llm.apiKey) {
    const result = await chatWithLLM(sessionId, req.message, toolCalls);
    reply = result;
  } else {
    reply = await chatGuided(req.message, req.userId ?? null, req.anonymousId, toolCalls);
  }

  await addMessage(sessionId, 'assistant', reply);
  await recordToolCalls(sessionId, toolCalls);

  return { reply, toolCalls };
}

function formatCompat(compat: CompatibilityResult): string {
  let msg = `**${compat.productTitle}** compatibility:\n`;
  msg += `- Induction: ${compat.matches.induction_compatible ? 'Yes' : 'No'}\n`;
  msg += `- Microwave: ${compat.matches.microwave_safe ? 'Yes' : 'No'}\n`;
  msg += `- Dishwasher: ${compat.matches.dishwasher_safe ? 'Yes' : 'No'}\n`;
  msg += `- Oven: ${compat.matches.oven_safe ? 'Yes' : 'No'}\n`;
  msg += `- PFAS-free: ${compat.matches.pfas_free ? 'Yes' : 'No'}\n`;
  if (compat.caveats.length) msg += `\n${compat.caveats.join('\n')}`;
  msg += `\n\nVerdict: ${compat.verdict}`;
  return msg;
}

/**
 * Guided selling flow (rule-based, no LLM).
 * Detects intent from keywords and dispatches tools accordingly.
 */
async function chatGuided(  message: string,
  userId: string | null,
  anonymousId: string,
  toolCalls: ToolResult[],
): Promise<string> {
  const lower = message.toLowerCase();

  // Intent detection — priority matters. Search/product intents come first so that
  // messages like "looking for a pan for my induction hob" are treated as searches,
  // not as a bare compatibility question.
  const wantsTrack = /\b(track|order no\.?|order number|where is my|status of my|shipped yet)\b/.test(lower) || /HTC-[A-Z0-9]+/i.test(lower);
  const wantsSearch = /\b(search|find|show|look(ing)? for|browse|recommend a|need a|want a|i need|i want|got any|have any)\b/.test(lower)
    || /(?:a|an|the) (non.?stick|ceramic|cast iron|porcelain|stainless steel|bamboo|silicone|glass|dutch oven|frying pan|saucepan|bowl|plate|set|cup|mug|tumbler|cutlery|utensil|jar|container|tray)\b/.test(lower)
    || /\bpan\b|\bsaucepans?\b|\bbowls?\b|\bplates?\b|\bbaking tray\b|\bmuffin\b/.test(lower);
  const wantsCart = /\b(add (to|a).*cart|put.*cart|cart it|buy|purchase|order this|ring this up)\b/.test(lower);
  const wantsBundle = /\b(bundles?|set of|complete set|starter kit|gift set|housewarming|wedding gift|for a gift)\b/.test(lower);
  const wantsCompat = /\b(compatible|compatibility|works with|safe for|okay for|fine for|suited to|suited for)\b/.test(lower)
    || /\b(dishwasher[ _-]?safe|microwave[ _-]?safe|oven[ _-]?safe|induction[ _-]?compatible|induction[ _-]?ready|hand[ _-]?wash)\b/.test(lower)
    || /\b(is it|is this|is that|can i).*\b(safe|compatible|work|usable|put in|use in)\b/.test(lower);

  const responses: string[] = [];

  // Handle greetings / short non-product messages
  const trimmed = lower.trim();
  if (trimmed.length <= 12 && !/[?]/.test(trimmed) && !wantsTrack && !wantsCart && !wantsBundle && !wantsCompat) {
    if (/\b(hi|hello|hey|thanks|thank you|how are you|help|good morning|good afternoon)\b/.test(lower)) {
      return 'Welcome to Charm! I\'m your tableware assistant. I can help you:\n\n• Find the perfect products for your kitchen\n• Check if items work with your induction hob, microwave, or dishwasher\n• Discover money-saving bundles\n• Track your orders\n\nWhat are you looking for today?';
    }
  }

  if (wantsTrack) {
    const orderMatch = message.match(/HTC-[A-Z0-9]+/i);
    if (orderMatch) {
      const result = await executeTool('order_track', { orderNumber: orderMatch[0] }, userId, anonymousId);
      toolCalls.push(result);
      if (result.success) {
        const order = result.result as any;
        if (order.error) {
          return `I couldn't find an order with number ${orderMatch[0]}. Could you double-check the order number?`;
        }
        return `Your order ${order.orderNumber} is currently **${order.state}**. It contains ${order.items} item(s) for a total of $${order.total}. Created on ${new Date(order.createdAt).toLocaleDateString()}.`;
      }
    }
    return 'I can help you track your order! Please provide your order number (e.g. HTC-XXXXX).';
  }

  if (wantsCompat) {
    // Try to extract a product mention or just provide general info
    const variantMatch = message.match(/variant[_-]?([a-f0-9-]+)/i);
    if (variantMatch) {
      const result = await executeTool('compatibility_check', { variantId: variantMatch[1] }, userId, anonymousId);
      toolCalls.push(result);
      if (result.success) {
        const compat = result.result as CompatibilityResult;
        if (!(compat as any).error) return formatCompat(compat);
      }
    }

    // No explicit variant id — search for the mentioned product and report its compatibility
    const compatQuery = message
      .replace(/\b(is it|is this|is that|can i|are they|are these|the|a|an|dishwasher[ _-]?safe|microwave[ _-]?safe|oven[ _-]?safe|safe|compatible|works with|hand[ _-]?wash)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    const search = await executeTool('product_search', { query: compatQuery.slice(0, 80), limit: 1 }, userId, anonymousId);
    if (search.success) {
      const hits = search.result as ProductHit[];
      if (hits.length > 0) {
        toolCalls.push(search);
        const hit = hits[0];
        const compat = await toolCompatibilityCheck({ variantId: hit.variantId });
        const c = { ...compat, variantId: hit.variantId, productTitle: hit.productTitle };
        return formatCompat(c);
      }
    }

    return 'I can check product compatibility! Which product are you interested in? Tell me about your kitchen setup (induction hob, microwave, dishwasher) and I\'ll find what works for you.';
  }

  if (wantsBundle) {
    const result = await executeTool('bundle_recommend', {}, userId, anonymousId);
    toolCalls.push(result);
    if (result.success) {
      const bundles = result.result as any[];
      if (bundles.length === 0) return 'We don\'t have any active bundles right now, but I can help you find individual products!';
      let msg = 'Here are our curated bundles:\n\n';
      for (const b of bundles) {
        msg += `**${b.title}** — ${b.discountPct}% off\n${b.description}\n(${b.itemCount} items)\n\n`;
      }
      msg += 'Would you like more details on any of these?';
      return msg;
    }
  }

  if (wantsSearch && !wantsBundle && !wantsCart || (!wantsSearch && !wantsCompat && !wantsBundle && !wantsCart && !wantsTrack)) {
    // Extract a query from the message
    const query = message
      .replace(/\b(search|find|show|look|looking for|need|want|recommend|please|can you|could you|i'm|i am)\b/gi, '')
      .trim()
      .slice(0, 200);

    const searchArgs: Record<string, unknown> = { limit: 5 };
    if (query.length > 2) searchArgs.query = query;

    // Detect material mentions
    if (/porcelain|ceramic/i.test(lower)) searchArgs.material = 'porcelain';
    if (/stainless steel|steel/i.test(lower)) searchArgs.material = 'stainless_steel';
    if (/bamboo|wood|wooden/i.test(lower)) searchArgs.material = 'bamboo';
    if (/cast iron/i.test(lower)) searchArgs.material = 'cast_iron';
    if (/silicone/i.test(lower)) searchArgs.material = 'silicone';
    if (/glass/i.test(lower)) searchArgs.material = 'glass';

    // Detect category mentions
    if (/pan|fry|skillet|sauté/i.test(lower)) searchArgs.category = 'cookware';
    if (/plate|bowl|dinner|tableware/i.test(lower)) searchArgs.category = 'dinnerware';
    if (/bake|tray|muffin|cookie/i.test(lower)) searchArgs.category = 'bakeware';
    if (/cup|mug|glass|tumbler|tea|coffee/i.test(lower)) searchArgs.category = 'drinkware';
    if (/fork|knife|spoon|cutlery|flatware/i.test(lower)) searchArgs.category = 'flatware';
    if (/spatula|spoon|utensil|gadget/i.test(lower)) searchArgs.category = 'utensils';
    if (/container|jar|storage|box/i.test(lower)) searchArgs.category = 'storage';

    // Detect feature mentions
    const features: string[] = [];
    if (/induction/i.test(lower)) features.push('induction_compatible');
    if (/microwave/i.test(lower)) features.push('microwave_safe');
    if (/dishwasher/i.test(lower)) features.push('dishwasher_safe');
    if (/non.?sticky?|pfas|eco|safe/i.test(lower)) features.push('pfas_free');
    if (features.length) searchArgs.features = features;

    const result = await executeTool('product_search', searchArgs, userId, anonymousId);
    toolCalls.push(result);

    if (result.success) {
      const hits = result.result as ProductHit[];
      if (hits.length === 0) return 'I couldn\'t find any products matching that description. Could you try different keywords? I can search by product type, material, or features.';
      let msg = `I found ${hits.length} product(s) for you:\n\n`;
      for (const h of hits) {
        const stockInfo = h.fulfilmentMode === 'make_to_order' ? '(made to order)' : (h.stock != null && h.stock > 0 ? `(${h.stock} in stock)` : '(out of stock)');
        msg += `**${h.productTitle}** — ${h.title}\n$${h.price.toFixed(2)} ${stockInfo}\nMaterial: ${h.material}\n\n`;
      }
      msg += 'Would you like to know more about any of these? I can check compatibility, add items to your cart, or recommend bundles!';
      return msg;
    }
  }

  if (wantsCart) {
    return 'I can add items to your cart! Just tell me which product you\'d like, and I\'ll find the right variant for you.';
  }

  return 'Welcome to Charm! I\'m your tableware assistant. I can help you:\n\n• Find the perfect products for your kitchen\n• Check if items work with your induction hob, microwave, or dishwasher\n• Discover money-saving bundles\n• Track your orders\n\nWhat are you looking for today?';
}

/**
 * LLM-powered chat (when LLM_API_KEY is configured).
 * Uses OpenAI-compatible API with tool calling.
 */
async function chatWithLLM(
  sessionId: string,
  message: string,
  toolCalls: ToolResult[],
): Promise<string> {
  const history = await getMessageHistory(sessionId);
  const systemPrompt = `You are the Charm Agent, a friendly and knowledgeable tableware/kitchenware sales assistant for HUWA TABLE CHARM. You help customers find the right products, check compatibility, recommend bundles, manage their cart, and track orders. Be helpful, concise, and conversational. You have access to tools that search the catalog, check product compatibility, recommend bundles, manage the cart, and track orders. Use them when appropriate.`;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-20),
  ];

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.llm.apiKey}`,
      },
      body: JSON.stringify({
        model: config.llm.model ?? 'gpt-4o-mini',
        messages,
        tools: AGENT_TOOLS.map((t) => ({ type: 'function', function: t })),
        tool_choice: 'auto',
        max_tokens: 1024,
      }),
    });

    if (!response.ok) throw new Error(`LLM API error: ${response.status}`);
    const data = await response.json() as any;
    const choice = data.choices?.[0];
    if (!choice) throw new Error('No response from LLM');

    const assistantMsg = choice.message;

    // Execute any tool calls the LLM requested
    if (assistantMsg.tool_calls) {
      for (const tc of assistantMsg.tool_calls) {
        const fnName = tc.function.name;
        const args = JSON.parse(tc.function.arguments ?? '{}');
        const result = await executeTool(fnName, args, sessionId, sessionId);
        toolCalls.push(result);
      }
    }

    return assistantMsg.content ?? 'I processed your request but have no text response. Check the tool results for details.';
  } catch (e: any) {
    // Fallback to guided flow if LLM fails
    return chatGuided(message, null, sessionId, toolCalls);
  }
}

async function recordToolCalls(sessionId: string, toolCalls: ToolResult[]): Promise<void> {
  for (const tc of toolCalls) {
    await db('agent_tool_calls').insert({
      id: uuid(),
      session_id: sessionId,
      tool: tc.tool,
      args: JSON.stringify(tc.result),
      result: JSON.stringify(tc.result),
      success: tc.success,
    });
  }
}
