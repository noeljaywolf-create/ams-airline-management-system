/**
 * Two views that make the case for the system honestly:
 *
 *   problem()    the operational failures being solved
 *   ecosystem()  what is built, what is schema only, and what is not there
 *
 * Both derive their figures from ecosystem.js, which imports the real
 * modules and inspects their actual exports. Nothing is asserted that
 * the code does not support.
 */

import {
  PROBLEMS, capabilityAudit, ecosystemTotals, LIVE,
} from './ecosystem.js';

import {
  bar, card, el, int, kpi, kpis, moneyShort, pill, provenance, table,
} from './format.js';

/* ==================================================================== *
 * PROBLEM
 * ==================================================================== */

export function problem(m) {
  const frag = document.createDocumentFragment();
  const totals = ecosystemTotals();

  frag.append(el('p', { class: 'lede' },
    'Every capability in this system exists because of a specific, recurring ' +
    'operational failure. None of these are hypothetical, and none are a ' +
    'competitor\'s weakness — they are what happens when an airline tries to run ' +
    'finance, fleet and procurement without attributing cost at the moment it occurs.'));

  frag.append(kpis(
    kpi('Failure modes addressed', String(totals.problems),
      `${totals.built} capabilities built, ${totals.schemaOnly} schema only`, 'good'),
    kpi('Live modules', String(totals.modules),
      `${totals.functions} functions, ${totals.constants} vocabulary tables`, 'good'),
    kpi('Sectors modelled', int(m.raw.length),
      `${int(m.flights.length)} costed from primary records`),
    kpi('Allocation reconciles', m.carbon.reconciliationFailures === 0 ? pill('EXACT', 'ok') : pill('BROKEN', 'bad'),
      'no cent created or destroyed'),
  ));

  for (const p of PROBLEMS) {
    const caps = capabilityAudit().filter((c) => c.problems.includes(p.id));

    frag.append(card(p.headline,
      `addresses ${caps.length} capabilit${caps.length === 1 ? 'y' : 'ies'}`,
      el('div', {},
        el('p', { class: 'lede', style: 'margin-bottom:12px' }, p.detail),
        el('div', { class: 'explain' },
          el('strong', {}, 'Consequence: '), p.consequence),
        el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-top:4px' },
          ...caps.map((c) => pill(c.name,
            c.status === 'BUILT' ? 'ok' : c.status === 'SCHEMA ONLY' ? 'warn' : 'bad'))),
        el('div', { class: 'provenance' },
          'Implemented by ',
          ...caps.map((c, i) => [
            i > 0 ? ', ' : '',
            el('code', {}, c.modulePath),
          ])))));
  }

  return frag;
}

/* ==================================================================== *
 * ECOSYSTEM
 * ==================================================================== */

export function ecosystem() {
  const frag = document.createDocumentFragment();
  const caps = capabilityAudit();
  const totals = ecosystemTotals();

  frag.append(el('p', { class: 'lede' },
    'This page audits itself. Every export listed below was verified to exist by ' +
    'importing the module at page load — if someone deletes a function, this table ' +
    'reports it as degraded rather than continuing to advertise a capability that is ' +
    'no longer in the code.'));

  frag.append(kpis(
    kpi('Capabilities', String(totals.capabilities),
      `${totals.built} built · ${totals.schemaOnly} schema only`),
    kpi('Modules inspected', String(totals.modules),
      `${totals.functions} exported functions`, 'good'),
    kpi('Live verification', totals.degraded === 0
      ? pill('ALL CONFIRMED', 'ok')
      : pill(`${totals.degraded} DEGRADED`, 'bad'),
      'exports checked against source',
      totals.degraded === 0 ? 'good' : 'bad'),
    kpi('Domain vocabulary', String(totals.constants),
      'const arrays generating DB constraints'),
  ));

  // Status split — no scores, just counts.
  const built = caps.filter((c) => c.status === 'BUILT').length;
  const schema = caps.filter((c) => c.status === 'SCHEMA ONLY').length;

  frag.append(card('Delivery status',
    'stated plainly, because a capability page that claims everything is complete is worthless',
    el('div', {},
      ...built ? [bar('BUILT — code exists and is tested', built, caps.length,
        `${built} of ${caps.length}`, 'ok')] : [],
      ...schema ? [bar('SCHEMA ONLY — designed, never executed', schema, caps.length,
        `${schema} of ${caps.length}`, 'warn')] : [],
      el('div', { class: 'explain', style: 'margin-top:12px' },
        el('strong', {}, 'Why "schema only" is not "done": '),
        'The migrations and the two backend modules have never been executed against a ' +
        'PostgreSQL database. Their SQL is written, their concurrency behaviour is documented ' +
        'from the database specification rather than observed, and the cost-authority module\'s ' +
        'type is a local stand-in awaiting the real Knex dependency. Everything in Parts IX ' +
        'and X of the hard-engineering guide describes code that has not run.'),
      provenance('frontend/js/ecosystem.js — imports each module and inspects its exports'))));

  // The capability table.
  const rows = caps.map((c) => ({
    name: c.name,
    status: c.status,
    capability: c.capability,
    module: c.modulePath,
    exports: c.exports,
    live: c.live,
    verified: c.verifiedExports,
    missing: c.missingExports,
    evidence: c.evidence,
    caveat: c.caveat,
  }));

  frag.append(card('Capability register',
    `${caps.length} capabilities · every export verified against source`,
    table([
      { key: 'name', label: 'Capability', cls: 'strong' },
      { key: 'status', label: 'Status',
        render: (v2) => pill(v2, v2 === 'BUILT' ? 'ok' : v2 === 'SCHEMA ONLY' ? 'warn' : 'bad') },
      { key: 'capability', label: 'What it does' },
      { key: 'module', label: 'Module', cls: 'mono' },
      { key: 'exports', label: 'Exports', num: true,
        render: (v2, row) => el('span', {
          style: row.live ? '' : 'color:var(--bad);font-weight:700',
          title: row.live ? 'all verified present' : `MISSING: ${row.missing.join(', ')}`,
        }, String(row.verified.length) + (row.live ? '' : ' !')) },
      { key: 'live', label: 'Live', render: (v2) => v2 ? pill('yes', 'ok') : pill('NO', 'bad') },
    ], rows)));

  // Evidence and caveats, per capability.
  frag.append(card('Evidence and limits',
    'how to check each claim, and what is NOT established',
    el('div', {},
      ...caps.map((c) => el('div', { style: 'padding:13px 0;border-bottom:1px solid var(--line-soft)' },
        el('div', { style: 'display:flex;gap:9px;align-items:center;margin-bottom:7px' },
          el('strong', { style: 'font-size:13px' }, c.name),
          pill(c.status, c.status === 'BUILT' ? 'ok' : 'warn'),
          c.live ? null : pill('EXPORTS MISSING', 'bad')),
        el('div', { style: 'font-size:12.5px;line-height:1.65;color:#2c3742;margin-bottom:7px' },
          el('strong', {}, 'Evidence: '), c.evidence),
        el('div', { style: 'font-size:12.5px;line-height:1.65;color:var(--warn);background:var(--warn-soft);padding:9px 11px;border-radius:4px' },
          el('strong', {}, 'Not established: '), c.caveat),
        c.exports.length
          ? el('div', { style: 'margin-top:7px;font-family:var(--mono);font-size:10.5px;color:var(--faint);line-height:1.7' },
            ...c.verifiedExports.flatMap((n, i) => [
              i > 0 ? '  ' : '', n + '()',
            ]))
          : el('div', { style: 'margin-top:7px;font-family:var(--mono);font-size:10.5px;color:var(--faint)' },
            'schema — no runtime exports'))))));

  // Live export inventory.
  const invRows = Object.entries(LIVE).map(([key, v]) => ({
    module: key,
    functions: v.functions.length,
    constants: v.constants.length,
    classes: v.classes.length,
    detail: v.functions.slice(0, 6).join(', ') + (v.functions.length > 6 ? `, +${v.functions.length - 6} more` : ''),
  }));

  frag.append(card('Live export inventory',
    'inspected at page load — this is what the modules actually expose',
    table([
      { key: 'module', label: 'Module', cls: 'strong mono' },
      { key: 'functions', label: 'Functions', num: true },
      { key: 'constants', label: 'Constants', num: true },
      { key: 'classes', label: 'Classes', num: true },
      { key: 'detail', label: 'Sample', cls: 'mono' },
    ], invRows)));

  // What is missing.
  frag.append(card('What this system does not do yet',
    'stated here rather than omitted, because omission reads as completeness',
    el('div', {},
      ...[
        ['No server, no authentication, no API',
          'The system cannot be run. No request can be authenticated and no tenant context is ' +
          'set. Everything behind the UI is a pure function.'],
        ['No database has ever been connected',
          'The migrations and both backend modules are unexecuted. Concurrency claims are ' +
          'inferred from PostgreSQL documentation, not observed.'],
        ['No concurrency test exists',
          'The one class of defect the suite cannot find is the one that costs real money. A ' +
          'parallel-authorisation test would either confirm the control or reveal it does not work.'],
        ['Regulatory constants are unvalidated',
          'MEL intervals, emission factors, burn coefficients and the reserve model are ' +
          'researched and coded but not signed off by a licensed aviation professional.'],
        ['No PDF, Excel or Word export',
          'Feasible as a pure function with no server dependency, and not yet built.'],
        ['No procurement or tender logic',
          'The department is registered and the roles exist; the operational logic is Phase 2 ' +
          'and deliberately not faked.'],
        ['One unfixed defect in the control core',
          'cost-authority.js:361 reads `commitmentId && commitment.budget_line_id` — an ' +
          'accidental logical AND. It evaluates correctly today and would silently fail on an ' +
          'empty string.'],
      ].map(([title, body]) => el('div', { style: 'padding:11px 0;border-bottom:1px solid var(--line-soft)' },
        el('div', { style: 'font-weight:650;font-size:12.5px;margin-bottom:4px' }, '✗ ' + title),
        el('div', { style: 'font-size:12px;line-height:1.6;color:var(--muted);padding-left:16px' }, body))))));

  return frag;
}