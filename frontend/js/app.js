/**
 * AMS UI demo — entry point.
 *
 * Imports the real domain modules from shared/src/ directly in the browser.
 * No build step, no bundler, no framework — consistent with ADR-001.
 */

import { buildModel } from './model.js?v=916b8a70583e';
import { TENANT } from './data.js?v=916b8a70583e';
import { clear, el, pill } from './format.js?v=916b8a70583e';
import {
  airworthiness, audit, carbon, costing, dashboard, fuel, routing,
} from './views.js?v=916b8a70583e';
import { ecosystem, problem } from './views-eco.js?v=916b8a70583e';
import { executive, home } from './views-exec.js?v=916b8a70583e';
import { portalView, scenarioView } from './views-portal.js?v=916b8a70583e';
import { accountsView } from './views-finance.js?v=916b8a70583e';
import { firstRunView, tourCompleted } from './tour.js?v=916b8a70583e';
import { createStore } from './portal/store.js?v=916b8a70583e';

/**
 * The store is created once and handed to the two interactive views. It
 * survives view switches, so a request raised in the cost authority queue is
 * still in the queue when you come back — which is the difference between an
 * application and a set of pages.
 */
const store = createStore();

/** Views that need the store; everything else keeps the plain `(model)` signature. */
const STORE_VIEWS = {
  portal: () => portalView(store),
  whatif: () => scenarioView(store),
  // First run is the default landing tab until it has been completed once.
  // It is not a modal: the user can leave, and it resumes where they stopped.
  firstrun: () => firstRunView(store, () => select('portal'), (n) => select(n)),
};

const VIEWS = {
  firstrun: STORE_VIEWS.firstrun,
  home,
  executive,
  portal: STORE_VIEWS.portal,
whatif: STORE_VIEWS.whatif,
  accounts: accountsView,
  problem,
  ecosystem,
  dashboard,
  costing,
  routing,
  fuel,
  airworthiness,
  carbon,
  audit,
};

/**
 * Two audiences, one system.
 *
 * The choice is a VIEW, not a separate application: every tab reads the same
 * computed model, so the executive brief and the compliance board cannot
 * disagree about a number. An executive who clicks "technical detail" on a
 * decision lands on the view an engineer would use, and sees the same value.
 */
const AUDIENCE_VIEWS = {
  executive: ['firstrun', 'home', 'executive', 'portal', 'whatif', 'accounts', 'dashboard', 'costing', 'routing', 'fuel', 'airworthiness', 'carbon'],
  technical: ['firstrun', 'home', 'executive', 'portal', 'whatif', 'accounts', 'problem', 'ecosystem', 'dashboard', 'costing', 'routing', 'fuel', 'airworthiness', 'carbon', 'audit'],
};

let audience = 'executive';

function applyAudience() {
  const allowed = new Set(AUDIENCE_VIEWS[audience]);
  for (const tab of document.querySelectorAll('#tabs .tab')) {
    const visible = allowed.has(tab.dataset.view);
    tab.style.display = visible ? '' : 'none';
  }
  document.getElementById('audience-switch').value = audience;
}

function setAudience(next) {
  audience = AUDIENCE_VIEWS[next] ? next : 'executive';
  applyAudience();
  try { localStorage.setItem('ams.audience', audience); } catch { /* private mode */ }
  // If the current view is hidden under the new audience, fall back to home.
  if (!AUDIENCE_VIEWS[audience].includes(current)) select('home');
}

const viewHost = document.getElementById('view');
const tabsHost = document.getElementById('tabs');
const badgeHost = document.getElementById('verdict-badge');

let model = null;
let current = 'home';

function select(name) {
  // A stale bundle paired with a fresh index.html can dispatch to a view
  // this copy does not have. That is a cache artefact, not a user error, and
  // blanking the page is the worst possible response to it — fall back to
  // the landing view and say so, rather than throwing inside the renderer.
  if (!Object.hasOwn(VIEWS, name)) {
    const fallback = Object.hasOwn(VIEWS, 'home') ? 'home' : Object.keys(VIEWS)[0];
    console.warn(`view "${name}" is not in this bundle; falling back to "${fallback}"`);
    name = fallback;
  }
  current = name;

  for (const tab of tabsHost.querySelectorAll('.tab')) {
    tab.setAttribute('aria-selected', tab.dataset.view === name ? 'true' : 'false');
  }

  clear(viewHost);
  try {
    viewHost.append(VIEWS[name](model));
  } catch (err) {
    viewHost.append(el('div', { class: 'card' },
      el('div', { class: 'card-body' },
        el('div', { class: 'kpi-label' }, 'View failed to render'),
        el('pre', { class: 'decision' }, String(err && err.stack ? err.stack : err)))));
    console.error(err);
  }

  window.scrollTo({ top: 0, behavior: 'instant' });
  history.replaceState(null, '', `#${name}`);
}

function boot() {
  document.getElementById('tenant-label').textContent =
    `${TENANT.icao} · ${TENANT.name} · FY${TENANT.fiscalYear}`;

  try {
    model = buildModel();
  } catch (err) {
    viewHost.append(el('div', { class: 'card' },
      el('div', { class: 'card-body' },
        el('div', { class: 'kpi-label' }, 'Model failed to build'),
        el('pre', { class: 'decision' }, String(err && err.stack ? err.stack : err)))));
    console.error(err);
    return;
  }

  const v = model.verdict;
  badgeHost.textContent = v.verdict.replace('_', ' ');
  badgeHost.className = `badge ${
    v.verdict === 'PROFITABLE' ? 'badge-ok'
    : v.verdict === 'MARGINAL' ? 'badge-warn'
    : v.verdict === 'NO_DATA' ? 'badge-mute'
    : 'badge-bad'}`;

  document.getElementById('test-count').textContent =
    `${model.flights.length.toLocaleString()} sectors · ${model.raw.length} flights`;

  // The store holds the model so the what-if view can compare an adjusted
  // figure against the baseline it started from.
  store.state.model = model;

  // A store change re-renders the current view. Only the interactive views
  // depend on the store, so a read-only tab is never repainted needlessly.
  store.subscribe(() => {
    if (Object.hasOwn(STORE_VIEWS, current)) select(current);
  });

  for (const tab of tabsHost.querySelectorAll('.tab')) {
    tab.addEventListener('click', () => select(tab.dataset.view));
  }

  try {
    const saved = localStorage.getItem('ams.audience');
    if (saved && AUDIENCE_VIEWS[saved]) audience = saved;
  } catch { /* private mode */ }
  applyAudience();

  const initial = location.hash.replace('#', '');
  // First visit lands on the guided run; after that, Home. A product that
  // has already introduced itself should not reintroduce itself, which is
  // why the tour records completion rather than nagging.
  const landing = tourCompleted() ? 'home' : 'firstrun';
  select(VIEWS[initial] ? initial : landing);
}

document.getElementById('audience-switch').addEventListener('change', (e) => {
  setAudience(e.target.value);
});

function onGotoActivate(e) {
  const target = e.target instanceof Element
    ? e.target.closest('[data-goto]')
    : null;
  if (!target) return;
  const to = target.getAttribute('data-goto');
  if (!to) return;
  if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
  e.preventDefault();
  select(to);
}

viewHost.addEventListener('click', onGotoActivate);
viewHost.addEventListener('keydown', onGotoActivate);

/* Exposed for tools/check-browser.mjs. `select` catches render errors and
 * paints an error card instead of throwing, which is right for a user and
 * wrong for verification: a broken view looks like a working one. Exporting
 * the router and the view list lets the checker drive every tab and inspect
 * what was actually painted. Read-only; nothing here changes behaviour. */
export const __select = select;
export const __viewNames = Object.keys(VIEWS);

boot();