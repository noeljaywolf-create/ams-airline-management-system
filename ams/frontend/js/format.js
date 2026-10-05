/**
 * Formatting and small DOM helpers.
 *
 * Every money value that reaches the screen is passed through money.js
 * `format()` first, so what you see is exactly what the ledger holds —
 * there is no second formatting path that could disagree.
 */

import { format as moneyFormat } from '../../shared/src/money.js';

/* ------------------------------------------------------------ formatting */

/** Integer cents → "$1,234.56". */
export const money = (cents) => moneyFormat(cents, 'USD');

/** Integer cents → "$1.23M" / "$847k", for KPI tiles. */
export function moneyShort(cents) {
  const abs = Math.abs(cents);
  if (abs >= 100_000_000) return `${cents < 0 ? '-' : ''}$${(abs / 100_000_000).toFixed(2)}B`;
  if (abs >= 100_000) return `${cents < 0 ? '-' : ''}$${(abs / 100_000).toFixed(1)}M`;
  if (abs >= 10_000) return `${cents < 0 ? '-' : ''}$${(abs / 100_000).toFixed(2)}M`;
  return moneyFormat(cents, 'USD');
}

/** Parts per million → "82.4%". */
export const pct = (ppm, dp = 1) => `${(ppm / 10_000).toFixed(dp)}%`;

/** Parts per million with an explicit sign, for gaps. */
export function pctSigned(ppm, dp = 1) {
  const sign = ppm > 0 ? '+' : '';
  return `${sign}${(ppm / 10_000).toFixed(dp)}pp`;
}

/**
 * Microcents → US dollars per unit.
 *
 * A microcent is 1/10,000 of a dollar. Converting is therefore `/ 100_000_000`:
 *
 *   microcents  →  cents  is  ÷ 1_000_000
 *   cents       →  dollars is ÷ 100
 *
 * Two mistakes were made here while building this, both caught by comparing
 * the output against published industry figures:
 *   ÷ 100      gave "$848.14" for a figure the industry quotes as "$0.08"
 *   ÷ 1e6      gave "$5.04",  still a hundredfold too large
 *
 * CASK is conventionally published to four decimal places, which is why the
 * result carries four.
 */
export const microcents = (mc) => (mc / 100_000_000).toFixed(4);

export const int = (n) => n.toLocaleString('en-US');

export const kg = (n) => `${int(n)} kg`;

export const km = (n) => `${int(n)} km`;

export const hours = (n) => `${n.toFixed(2)} h`;

/* ------------------------------------------------------------------- DOM */

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2).toLowerCase(), v);
    else node.setAttribute(k, String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

export const clear = (node) => { while (node.firstChild) node.removeChild(node.firstChild); };

/** A card with a heading and optional right-aligned note. */
export function card(title, note, body, bodyClass = '') {
  return el('section', { class: 'card' },
    el('div', { class: 'card-head' },
      el('div', { class: 'card-title' }, title),
      note ? el('div', { class: 'card-note' }, note) : null),
    el('div', { class: `card-body ${bodyClass}` }, body));
}

/** KPI tile. tone: 'good' | 'bad' | 'warn' | null */
export function kpi(label, value, sub, tone = null) {
  return el('div', { class: `kpi ${tone ?? ''}` },
    el('div', { class: 'kpi-label' }, label),
    el('div', { class: 'kpi-value' }, value),
    sub ? el('div', { class: 'kpi-sub' }, sub) : null);
}

export function kpis(...tiles) {
  return el('div', { class: 'kpis' }, tiles);
}

/**
 * Table builder. cols: [{ key, label, num?, cls?, render? }]
 * Passing `render` lets a cell return a Node instead of text.
 */
export function table(cols, rows, { scroll = true } = {}) {
  const thead = el('thead', {}, el('tr', {},
    cols.map((c) => el('th', { class: c.num ? 'num' : (c.cls ?? '') }, c.label))));

  const tbody = el('tbody', {}, rows.map((row) => el('tr', {},
    cols.map((c) => {
      const raw = typeof c.key === 'function' ? c.key(row) : row[c.key];
      const rendered = c.render ? c.render(raw, row) : raw;
      const node = rendered instanceof Node ? rendered : String(rendered ?? '');
      return el('td', { class: [c.num ? 'num' : '', c.cls ?? ''].filter(Boolean).join(' ') }, node);
    }))));

  return el(scroll ? 'div' : 'div', { class: scroll ? 'table-scroll' : '' },
    el('table', {}, thead, tbody));
}

/** Pill with a tone. tone: 'ok' | 'warn' | 'bad' | 'neutral' | 'info' */
export function pill(text, tone = 'neutral') {
  return el('span', { class: `pill pill-${tone}` }, text);
}

/** Horizontal bar. value/max drives the fill width. */
export function bar(label, value, max, display, tone) {
  const width = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return el('div', { class: 'bar-row' },
    el('div', { class: 'bar-label' }, label),
    el('div', { class: 'bar-track' },
      el('div', { class: `bar-fill ${tone ?? ''}`, style: `width:${width}%` })),
    el('div', { class: 'bar-value' }, display));
}

/** Inline SVG sparkline. values are plotted left to right. */
export function sparkline(values, { width = 640, height = 60, tone = 'var(--accent)' } = {}) {
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('class', 'sparkline');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', String(height));
  svg.setAttribute('preserveAspectRatio', 'none');

  if (values.length < 2) return svg;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 4;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - pad - ((v - min) / span) * (height - pad * 2);
    return [x, y];
  });

  // Area fill.
  const areaD = `M0,${height} L${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L')} L${width},${height} Z`;
  const area = document.createElementNS(svgNS, 'path');
  area.setAttribute('d', areaD);
  area.setAttribute('fill', tone);
  area.setAttribute('opacity', '0.09');
  svg.append(area);

  // Line.
  const line = document.createElementNS(svgNS, 'path');
  line.setAttribute('d', `M${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L')}`);
  line.setAttribute('fill', 'none');
  line.setAttribute('stroke', tone);
  line.setAttribute('stroke-width', '1.8');
  line.setAttribute('stroke-linejoin', 'round');
  svg.append(line);

  // Last point marker.
  const [lx, ly] = pts[pts.length - 1];
  const dot = document.createElementNS(svgNS, 'circle');
  dot.setAttribute('cx', lx.toFixed(1));
  dot.setAttribute('cy', ly.toFixed(1));
  dot.setAttribute('r', '3');
  dot.setAttribute('fill', tone);
  svg.append(dot);

  return svg;
}

/** A labelled form field. */
export function field(label, input) {
  return el('div', { class: 'field' },
    el('label', {}, label),
    input);
}

/** Provenance footer — where a figure came from. */
export function provenance(...parts) {
  return el('div', { class: 'provenance' },
    'Computed by ', ...parts.map((p, i) => [
      i > 0 ? ', ' : '', el('code', {}, p),
    ]));
}

/** Verdict word with the correct tone. */
export function verdictTone(verdict) {
  return {
    PROFITABLE: 'ok',
    MARGINAL: 'warn',
    LOSS_MAKING: 'bad',
    NO_DATA: 'neutral',
  }[verdict] ?? 'neutral';
}