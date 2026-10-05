/**
 * AMS UI demo — entry point.
 *
 * Imports the real domain modules from shared/src/ directly in the browser.
 * No build step, no bundler, no framework — consistent with ADR-001.
 */

import { buildModel } from './model.js';
import { TENANT } from './data.js';
import { clear, el, pill } from './format.js';
import {
  airworthiness, audit, carbon, costing, dashboard, fuel, routing,
} from './views.js';
import { ecosystem, problem } from './views-eco.js';

const VIEWS = {
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

const viewHost = document.getElementById('view');
const tabsHost = document.getElementById('tabs');
const badgeHost = document.getElementById('verdict-badge');

let model = null;
let current = 'dashboard';

function select(name) {
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

  for (const tab of tabsHost.querySelectorAll('.tab')) {
    tab.addEventListener('click', () => select(tab.dataset.view));
  }

  const initial = location.hash.replace('#', '');
  select(VIEWS[initial] ? initial : 'problem');
}

boot();