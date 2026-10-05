"""
Part XIII (defects) and Part XIV (what comes next + glossary).
"""

from framework import (BUL, CALLOUT, CODE, H1, H2, H3, LEAD, NUMLIST, P,
                       RULEHR, SPACER, TABLE)


def build(story):
    # ================= PART XIII =================
    story += H1('Part XIII — Defects found, and what they teach')

    story += LEAD(
        'This part documents six real defects found in the AMS codebase, four '
        'of them by automated verification rather than by reading the code. '
        'They are included because a system that has never been wrong has not '
        'been tested — and because each one is a lesson about how to work.')

    story += CALLOUT(
        'note', 'Why a training document admits its own bugs',
        'Because the alternative is worse. A guide that presented only working '
        'code would teach patterns without teaching how to recognise when they '
        'are broken. Each defect below was found by a specific mechanism, and '
        'that mechanism is the transferable lesson.')

    # --- Defect 1 ---
    story += H2('Defect 1: an object built from nothing')

    story += CODE(
        '''// WHAT THE CODE DID
aggregatePnl([...flights])._roll
// → { distanceKm: 0, passengers: 0, seats: 0, loadFactorPpm: 0, ... }

// A helper named seatsFrom multiplied by an undefined field,
// so it always returned 0. Every figure in _roll was therefore zero,
// and _roll was attached to the return value of aggregatePnl —
// which means it serialised into every route P&L API response.''')

    story += P(
        'Every number in that object was fabricated. It was not a '
        'mis-calculation; it was an object whose inputs were all zero because '
        'the code reading them was itself broken.')

    story += CODE(
        '''// THE FIX, AS A TEST
describe('defect 1 — no fabricated metrics reach the API', () => {
  it('the aggregate carries no internal or underscore-prefixed fields', () => {
    const agg = aggregatePnl([LEG(150), LEG(160)]);
    const offenders = Object.keys(agg).filter((k) => k.startsWith('_'));
    expect(offenders).toEqual([]);
  });

  it('every aggregate metric is a real sum of real flight facts', () => {
    const flights = [LEG(150), LEG(160), LEG(140)];
    const agg = aggregatePnl(flights);

    expect(agg.passengers).toBe(450);
    expect(agg.seatsOffered).toBe(567);
    expect(agg.distanceKm).toBe(33_000);
    expect(agg.blockHours).toBe(33);
  });
});''')

    story += CALLOUT(
        'bug', 'How this shipped through 118 green tests',
        'No test asserted anything about `_roll`, because nobody had asked for '
        'it. The tests verified the fields they knew about, and the fabricated '
        'object sat in the response unnoticed until someone read the actual '
        'output. **Found by reading, not by testing.**')

    story += P(
        'The general lesson: if a value is being returned to a user or an API '
        'consumer, someone should ask where every field in it came from. A '
        'field prefixed with an underscore conventionally means "internal" — '
        'and this one was both internal and wrong.')

    # --- Defect 2 ---
    story += H2('Defect 2: an answer multiplied by zero')

    story += CODE(
        '''// WHAT THE CODE DID
function breakEvenPassengers(agg) {
  return (agg.revenueCents / agg.loadFactorPpm) * 0;   // always 0
}

// and when that produced something useless, it fell back to:
const HARDCODED_FARE = 12_000;
return HARDCODED_FARE * 0.62;                          // always 7440''')

    story += P(
        'This function answered a commercially critical question — how many '
        'extra passengers would this route need to break even — with a number '
        'derived from nothing. Multiplying by zero always gives zero; the '
        'hardcoded fare of US$120 was the only thing that ever appeared in the '
        'output.')

    story += CODE(
        '''// THE FIX
function breakEvenPassengers(agg) {
  const flights = agg.flights || 1;
  const passengers = agg.passengers || 0;

  const revenuePerPassengerCents = passengers > 0
    ? Math.round(agg.revenueCents / passengers)
    : 0;
  const marginalCostCents = agg.marginalSeatCostCents ?? 0;
  const contributionPerPassengerCents = revenuePerPassengerCents - marginalCostCents;

  const perFlightLoss = Math.max(0, -agg.contributionCents) / flights;
  if (perFlightLoss === 0) {
    return { additionalPassengersPerFlight: 0, closeableByLoadFactor: true,
      revenuePerPassengerCents, contributionPerPassengerCents };
  }

  // Carrying a passenger costs more than they pay. More load does not
  // fix this; the route needs re-pricing, a fleet change or withdrawal.
  if (contributionPerPassengerCents <= 0) {
    return { additionalPassengersPerFlight: Number.MAX_SAFE_INTEGER,
      closeableByLoadFactor: false,
      revenuePerPassengerCents, contributionPerPassengerCents };
  }

  return {
    additionalPassengersPerFlight: Math.ceil(perFlightLoss / contributionPerPassengerCents),
    closeableByLoadFactor: true,
    revenuePerPassengerCents, contributionPerPassengerCents,
  };
}''')

    story += CODE(
        '''/**
 * If that is positive, additional passengers CLOSE the gap and the answer
 * is the per-flight loss divided by it. If it is negative — the airline is
 * paying more to carry a passenger than that passenger earns — adding
 * passengers makes the loss WORSE, and the honest answer is that the gap
 * cannot be closed by load factor at all.
 *
 * An earlier version of this function multiplied by zero and fell back to
 * a hardcoded US$120 fare, so it returned a number derived from nothing.
 * A magic constant here produces a confidently wrong number to a manager
 * deciding a route's future.
 */''')

    story += CALLOUT(
        'bug', 'The fix is not just arithmetic — it adds a business case',
        'The corrected version handles a case the original never could: what if '
        'a passenger costs more to carry than they pay? In that situation more '
        'load makes the loss *worse*, and the honest answer is that load factor '
        'cannot fix the problem. The function now returns '
        '`closeableByLoadFactor: false` and says so. **A function that can only '
        'ever produce a positive answer is usually hiding a case.**')

    story += TABLE(
        ['Situation', 'Correct answer', 'What the old code said'],
        [
            ['Loss, passengers profitable', 'A real number of extra passengers',
             '7440, always'],
            ['Loss, each passenger costs more than they pay',
             'Cannot be closed by load factor', '7440'],
            ['Already profitable', '0', '7440'],
        ],
        widths=[34, 33, 33])

    story += CALLOUT(
        'good', 'The test that encodes the fix',
        'The regression test asserts **structurally**: that the returned value '
        'is derived from the aggregate\'s real revenue-per-passenger and real '
        'marginal cost, and that changing those inputs changes the answer. A '
        'test asserting "the answer is 7440" would have passed the broken code '
        'and failed the fix.')

    # --- Defect 3 ---
    story += H2('Defect 3: the test that shared the bug')

    story += CODE(
        '''// THE BUG
export function requiredAtDeparture(legFuelKg, reserveKg) {
  for (let i = n - 1; i >= 0; i -= 1) {
    const forLeg = legFuelKg[i] + reserveKg;
    required[i] = i === n - 1 ? forLeg : Math.max(forLeg, required[i + 1]);
  }
}

// legs [1000, 2000, 500], reserve 300, route A-B-C-D
// This produced:  required[2] = 800, required[1] = 2300, required[0] = 2300
// The correct answer:                                    2800             3800''')

    story += P(
        'The old formula used `max(leg + reserve, required[i+1])`. It should be '
        '`leg + max(reserve, required[i+1])`. These differ: you need enough to '
        'fly the leg *plus* whatever the rest of the route requires, whereas '
        'the old version took the larger of the two, which under-fuels the '
        'earlier departures.')

    story += CODE(
        '''// THE FIX
export function requiredAtDeparture(legFuelKg, reserveKg) {
  const n = legFuelKg.length;
  const required = new Array(n);
  for (let i = n - 1; i >= 0; i -= 1) {
    // Departing stop i you must burn leg i to reach stop i+1, and then
    // hold AT LEAST the reserve — but possibly more than the reserve,
    // because everything the rest of the route needs must still be on
    // board when you leave i. Hence max(), and hence the composition is
    // legFuel[i] + max(reserve, required[i+1]), not max(legFuel[i]+reserve,
    // required[i+1]). The latter silently under-fuels the first departure
    // of every multi-leg route.
    const neededBeyond = i === n - 1 ? reserveKg : Math.max(reserveKg, required[i + 1]);
    required[i] = legFuelKg[i] + neededBeyond;
  }
  return required;
}''')

    story += CALLOUT(
        'bug', 'The part that matters: the test was wrong too',
        'The original test asserted `required[1]` is 2300 and `required[0]` is '
        '2300 — exactly the buggy values. The implementation and its test were '
        'wrong in the same direction, so the test passed and confirmed the bug. '
        'It was caught only by the exhaustive oracle comparison.')

    story += CODE(
        '''// THE CORRECTED TEST, WITH THE REASONING WRITTEN DOWN
it('composes the whole remainder of the route, not just the next leg', () => {
  // legs [1000, 2000, 500], reserve 300, route A-B-C-D.
  // Departing C: 500 leg + 300 reserve           =  800
  // Departing B: 2000 leg + max(300, 800)         = 2800
  // Departing A: 1000 leg + max(300, 2800)        = 3800
  //
  // This test originally asserted 2300/2300, which was wrong in exactly
  // the same way the implementation was wrong: it treated the reserve
  // as if it were the only requirement beyond the next leg, so it
  // under-fuelled the first departure. Both the code and the test were
  // wrong in the same direction, which is what a test suite written from
  // the author's own mental model looks like. Caught by the exhaustive
  // oracle, not by inspection of either.
  const required = requiredAtDeparture([1000, 2000, 500], 300);
  expect(required[2]).toBe(800);
  expect(required[1]).toBe(2800);
  expect(required[0]).toBe(3800);
});''')

    story += CALLOUT(
        'bug', 'This is the most instructive defect in the codebase',
        'A test written by the same person, from the same mental model, '
        'asserting the same misunderstanding. Testing something against your own '
        'model of how it should behave does not validate the model. This is why '
        'the AMS routing tests compare against an **exhaustive search** rather '
        'than against hand-written expectations — an oracle cannot share your '
        'misunderstanding, because it has no model at all.')

    # --- Defect 4 ---
    story += H2('Defect 4: the wrong node in the solver')

    story += CODE(
        '''// THE BUG
buckets[nf].push({ fuelUsed: nf, costCents: nc, from: state.from, prevFuel: f });
//                                                             ^^^^^^^^^^^^^^
// Carried the node the flight DEPARTED from, not the one it ARRIVED at.

// Later, when that state was processed:
for (const edge of adjacency.get(state.from) ?? []) {
//                                  ^^^^^^^^^^^^^ re-expanded the WRONG airport

// The consequence: the DP reported routes as INFEASIBLE that the primary
// solver had found. Nobody noticed, because nothing compared the two.''')

    story += CODE(
        '''// THE FIX
      buckets[nf].push({ node: edge.to, costCents: nc,
                         prevNode: state.node, prevFuel: f });''')

    story += CALLOUT(
        'bug', 'Why this is the strongest argument in the guide',
        'A second implementation is only useful if something forces the two to '
        'agree. Two solvers that disagree and are never compared provide no '
        'more assurance than one. This defect sat in the code, passing every '
        'existing test, until the cross-check was added.')

    # --- Defect 5 ---
    story += H2('Defect 5: refusing the plans it existed for')

    story += CODE(
        '''// THE BUG
const required = requiredAtDeparture(legFuelKg, reserveKg);
if (required[0] > tankCapacityKg) {
  throw new RefuelError(`Route needs ${required[0]}kg at the first departure
    but tank capacity is ${tankCapacityKg}kg. The route is not flyable.`);
}''')

    story += P(
        '`requiredAtDeparture` returns the fuel needed to complete the *whole '
        'remaining route* without refuelling. For any multi-stop route that '
        'exceeds tank capacity — which is normal, because you refuel at the '
        'intermediate stops. The check therefore rejected every multi-stop '
        'route, which is precisely what the function exists to plan.')

    story += CODE(
        '''// THE FIX — check each LEG, not the whole route
  for (let i = 0; i < legFuelKg.length; i += 1) {
    if (legFuelKg[i] + reserveKg > tankCapacityKg) {
      throw new RefuelError(
        `Sector ${stops[i]} -> ${stops[i + 1]} needs ${legFuelKg[i] + reserveKg}kg ` +
          `(leg + ${reserveKg}kg reserve) but tank capacity is only ${tankCapacityKg}kg. ` +
          'No refuelling schedule can make this route legal.',
        'REFUEL_ROUTE_INFEASIBLE',
      );
    }
  }''')

    story += CALLOUT(
        'bug', 'The error message now names the offending sector',
        'The fix does not just change the arithmetic — it improves the '
        'diagnosis. "Route needs 16500kg but tank capacity is 10000kg" told the '
        'user nothing actionable. "Sector B → C needs 30500kg" tells them '
        'exactly which leg cannot be flown and why.')

    # --- Defect 6 ---
    story += H2('Defect 6: an infinite loop in a legal case')

    story += CODE(
        '''// THE BUG
function dominates(ca, fa, cb, fb) {
  return ca <= cb && fa <= fb && (ca < cb || fa < fb);
}

// A zero-cost, zero-fuel cycle produces a label IDENTICAL to one already
// present. Identical labels do not strictly dominate one another — the
// `&& (ca < cb || fa < fb)` clause is false when both are equal.
// So the identical label was accepted, expanded, and produced another
// identical label, forever.''')

    story += CODE(
        '''// THE FIX
      for (const other of target) {
        if (dominates(other.costCents, other.fuelUsedKg, costCents, fuelUsedKg)) {
          dominated = true; break;
        }
        if (other.costCents === costCents && other.fuelUsedKg === fuelUsedKg) {
          dominated = true; break;
        }
      }''')

    story += CODE(
        '''// THE FIX, EXPLAINED IN THE CODE
      // The duplicate check is not cosmetic. A zero-cost, zero-fuel cycle
      // produces a label identical to one already present. Identical
      // labels do not strictly dominate one another, so without this the
      // planner re-queues the same (cost, fuel) pair forever and never
      // terminates. Rejecting the duplicate is safe: the incumbent label
      // has an equally good prefix and is already in the heap.''')

    story += CALLOUT(
        'bug', 'How it was found, and what that says about testing',
        'The test suite **hung for five minutes and was killed by a timeout**. '
        'A correctness assertion would not have found this — the code was not '
        'producing wrong answers, it was producing no answers at all. Only '
        'running it with a time limit revealed the problem.')

    story += P(
        'This is why the AMS test suite includes an explicit performance '
        'assertion and why edge cases like zero-cost cycles are tested at all. '
        '**Non-termination is a failure mode that correctness assertions cannot '
        'detect.**')

    # --- summary ---
    story += H2('What the pattern tells you')

    story += TABLE(
        ['Defect', 'Type', 'Found by'],
        [
            ['1. Fabricated `_roll` object', 'Wrong data returned', 'Reading the code'],
            ['2. Answer multiplied by zero', 'Wrong arithmetic', 'Reading the code'],
            ['3. Under-fuelled first departure', 'Wrong formula',
             'Exhaustive oracle comparison'],
            ['4. Wrong node in the DP solver', 'Wrong state carried',
             'Cross-check between two solvers'],
            ['5. Feasibility check too strict', 'Wrong condition',
             'Exhaustive oracle comparison'],
            ['6. Infinite loop on identical labels', 'Non-termination',
             'Test suite timeout'],
        ],
        widths=[34, 28, 38])

    story += P('Four patterns run through all six.')

    story += NUMLIST([
        '**Two of six were found by a human reading code, not by any test.** '
        'The two costing defects had a fully green 118-test suite. No '
        'automated check was looking for the right things.',
        '**Three were found by differential testing** — comparing an algorithm '
        'against an independent implementation or exhaustive search. This is '
        'the highest-yield technique in the codebase.',
        '**One was found by the test simply running.** Non-termination is '
        'invisible to assertions.',
        '**In two cases the test encoded the bug.** This is the most common '
        'failure mode of hand-written expectations and the reason differential '
        'testing exists.',
    ])

    story += CALLOUT(
        'good', 'The honest summary',
        'The codebase went from 118 tests to 190, and the six defects above were '
        'found along the way. That is roughly one defect per 12 tests added. It '
        'is also why the routing module — the newest and most thoroughly tested '
        'part of the system — is the part the engineers are most confident in. '
        'Confidence tracks verification effort, and nothing else.')

    story += RULEHR()

    # ================= PART XIV =================
    story += H1('Part XIV — What comes next')

    story += LEAD(
        'This part covers planned work, the boundary of what software can '
        'verify, and a glossary of the terms used throughout.')

    story += H2('The server layer, when it is built')

    story += P(
        'AMS currently has no HTTP layer. The domain modules in `shared/src/` '
        'are complete and tested; what is missing is the code that receives '
        'requests, calls those modules, and writes results to the database.')

    story += CODE(
        '''// WHAT WOULD BE BUILT (does not exist yet)
import express from 'express';
import knex from 'knex';

const app = express();
const db = knex(knexConfig);

app.post('/api/tenants/:tenantId/flight-costs', async (req, res) => {
  // 1. authenticate  — who is calling?
  // 2. validate      — is the request well-formed?
  // 3. authorise     — may this caller do this to this tenant's data?
  // 4. compute       — call flightPnl() from shared/src/costing.js
  // 5. persist       — write the attributed cost, in a transaction
  // 6. audit         — record who did what, in the same transaction
});''')

    story += CALLOUT(
        'warn', 'The dependency order is not negotiable',
        'Steps 1 to 3 come before any data is read or written. Building the '
        'reporting and export features on top of an API with no authentication '
        'would put unauthenticated access to financial data behind a public '
        'URL. The domain logic is ready; the door is not.')

    story += H2('Identity, access and multi-tenancy')

    story += P(
        'AMS is a multi-tenant platform: multiple airlines, each with separate '
        'data. This is not a feature bolted on at the end — it changes the '
        'database schema, every query, and the audit model.')

    story += CODE(
        '''export const ROLES = [
  'platform_admin', 'tenant_admin', 'ceo', 'finance_director',
  'controller', 'accountant', 'procurement_manager',
  'technical_manager', 'flight_ops_manager', 'safety_officer', 'auditor',
];

export const DEPARTMENTS = [
  'executive', 'flight_operations', 'technical_engineering', 'crew_scheduling',
  'training_standards', 'safety_risk', 'quality_assurance',
  'commercial_revenue', 'ticketing_distribution', 'customer_service',
  'cargo', 'ground_operations', 'finance_treasury', 'procurement_supply',
  'human_resources', 'it_mis',
];''')

    story += CODE(
        '''// Tenant isolation appears in every query in cost-authority.js:
const line = await db('budget_lines')
  .where({ id: lineId, tenant_id: tenantId })   // ← always both columns
  .forUpdate()
  .first();

// And in audit verification, so one tenant's data cannot contaminate another's:
export function verifyTenantChain(allEntries, tenantId) {
  const scoped = allEntries.filter((e) => e.tenantId === tenantId);
  return { tenantId, ...verifyChain(scoped) };
}''')

    story += CODE(
        ''' * Aviation regulations mandate named accountable managers, so the
 * department structure is a regulatory artefact, not a UI preference.
 *
 *   16 registered. 5 functional in wave 1: Finance & Treasury,
 *   Procurement & Supply, Technical/Engineering, Executive, IT/Admin.
 *   11 explicitly Phase 2.''')

    story += CALLOUT(
        'note', 'Why the department list is a regulatory artefact',
        'Aviation regulations in most jurisdictions require an operator to '
        'appoint named holders of specific accountability positions — a safety '
        'officer, a quality manager, a technical manager. AMS must record who '
        'holds each role and what authority approved them, because that is an '
        'operating licence requirement, not a user-interface preference. This '
        'is why the roles appear in `domain.js` alongside the cost categories '
        'rather than in frontend configuration.')

    story += H2('Spreadsheets, PDF and Word generation')

    story += P(
        'These were discussed as a requirement and assessed as feasible. All '
        'three are *generation* — AMS produces a file — which is fundamentally '
        'different from hosting a collaborative editor, and none of it requires '
        'the server layer.')

    story += TABLE(
        ['Output', 'How it would be produced', 'Verdict'],
        [
            ['CSV export', 'Written by hand — no dependency, opens in any '
             'spreadsheet application', 'Start here'],
            ['Excel (.xlsx)',
             'The `SheetJS` library — real multi-sheet workbooks, frozen '
             'headers, number formats', 'Viable, one dependency'],
            ['PDF forms',
             'The `pdfkit` library — streams a document without a browser',
             'Viable, one dependency'],
            ['Word (.docx)', 'The `docx` library',
             'Viable, but see the caveat'],
        ],
        widths=[18, 52, 30])

    story += CODE(
        '''// Why this is a pure function, like everything in shared/src/
export function budgetVarianceCsv(rows) {
  // 1. Validate input as integer cents
  // 2. Compute variance per row
  // 3. Emit CSV with no float formatting
  // 4. Test: assert the file round-trips and the columns sum to the total
}''')

    story += CALLOUT(
        'warn', 'The caveat on Word documents, and why it is not about technology',
        'An editable `.docx` that people can modify is a document *outside* the '
        'audit chain. In a system holding records that regulators may require '
        'years later, "it was in the Word file" is not a defensible answer to '
        '"what did the approved maintenance manual say on this date?" If the '
        'document must not change, generate PDF and skip Word. If it must be '
        'editable, it belongs inside AMS with version history and audit '
        'trail.')

    story += CODE(
        '''// The safest dependency position: CSV by hand costs nothing.
const ESCAPE = (v) => `"${String(v).replace(/"/g, '""')}"`;
// Double the quote character inside a quoted field — RFC 4180.
export function toCsv(headers, rows) {
  return [
    headers.join(','),
    ...rows.map((r) => r.map(ESCAPE).join(',')),
  ].join('\\r\\n');
}''')

    story += H2('What still needs a qualified human')

    story += LEAD(
        'This is the most important section in the document, and the shortest, '
        'because it is where software ends.')

    story += TABLE(
        ['Area', 'What software can do', 'What requires a qualified human'],
        [
            ['Cost taxonomy',
             'Enforce the categories are valid and sum correctly',
             'Decide whether the categories match how IFRS and IATA actually '
             'require reporting'],
            ['Regulatory reserve',
             'Enforce fuel never drops below the configured figure',
             'Confirm the configured figure is legally correct for the '
             'jurisdiction'],
            ['MEL intervals',
             'Compute deadlines from the category table',
             'Verify the category table matches current EASA CS-GEN-MMEL'],
            ['AD applicability',
             'Apply the serial range and threshold rules as given',
             'Confirm the modelled applicability matches how a regulator '
             'actually determines it'],
            ['Fuel burn factors',
             'Apply the constants',
             'Validate them against this fleet\'s measured data'],
            ['Operating policy',
             'Show the numbers',
             'Decide what the airline should do about them'],
        ],
        widths=[17, 37, 46])

    story += CALLOUT(
        'bug', 'The boundary, stated precisely',
        'Every test in AMS proves the code does what its authors intended. '
        '**No test can prove the intent was correct.** If the regulatory reserve '
        'requirement is wrong, all 190 tests pass and the aircraft is dispatched '
        'below its legal minimum. Software can enforce a rule; only a qualified '
        'person can establish that the rule is the right one.')

    story += CODE(
        '''// What the system can prove:
//   "Cumulative fuel on this route never exceeds capacity minus the
//    configured reserve of 1500 kg."
//
// What it cannot prove:
//   "1500 kg is the legally correct reserve for this operation."''')

    story += P(
        'This is not a limitation to be engineered away. It is a permanent '
        'division of responsibility. The value of a system like AMS is that it '
        'makes the *computation* exact and the *decision* supportable — which '
        'means it makes the qualified human\'s judgement more valuable, not less.')

    story += RULEHR()

    # ---------------- GLOSSARY ----------------
    story += H1('Glossary')

    story += P(
        'Terms used in this guide, in the order they appear. Where a term has '
        'both a general and an AMS-specific meaning, the AMS usage is given.')

    for term, definition in [
        ('ASK (Available Seat Kilometres)',
         'Seats offered multiplied by distance flown. The supply side of '
         'capacity, unaffected by ticket sales.'),
        ('AD (Airworthiness Directive)',
         'A mandatory instruction issued by a civil aviation regulator. '
         'Distinct from a Service Bulletin, which is not legally binding until '
         'adopted by an AD.'),
        ('ATA chapter',
         'The industry-standard equipment taxonomy — chapter 32 is landing '
         'gear, chapter 55 is powerplant. Engineers search compliance items by '
         'chapter, not by directive number.'),
        ('Block hours',
         'Time from door-close to door-open. The measure of aircraft flying '
         'time, and therefore of utilisation.'),
        ('CASK (Cost per Available Seat Kilometre)',
         'Operating cost divided by ASK. The industry\'s primary efficiency '
         'measure. Computed in AMS in microcents.'),
        ('CASM',
         'CASK expressed per Available Seat Mile rather than kilometre. '
         'Provided for US comparability.'),
        ('Cents',
         'The integer unit AMS uses for all money. Never a float. 123456 '
         'represents US$1,234.56.'),
        ('CTK (Cargo Tonne Kilometre)',
         'The freight analogue of RPK — cargo mass multiplied by distance.'),
        ('CORSIA',
         'The ICAO global market-based measure for international aviation '
         'emissions, with thresholds and compliance periods.'),
        ('EU ETS',
         'The European Union Emissions Trading System, which covers intra-EU '
         'aviation and certain departures to the UK and Switzerland.'),
        ('ETOPS reserve',
         'Additional fuel required on long-range routes where a diversion '
         'would take the aircraft beyond the coverage of a suitable airport.'),
        ('ETOPS', 'Extended-range Twin-engine Operational Safety Standards.'),
        ('Final reserve',
         'The fuel an aircraft must still have on landing — typically 30 '
         'minutes at holding speed. A hard regulatory minimum.'),
        ('Flat allocation',
         'Giving every flight the same share of a fixed cost. Crude but '
         'defensible for genuinely uniform costs; usually wrong.'),
        ('FOR UPDATE',
         'A database instruction that locks a row until the current '
         'transaction ends. The mechanism that makes double-spending '
         'unrepresentable in AMS.'),
        ('Idempotency key',
         'A unique value sent with a request so that a retry does not perform '
         'the work twice.'),
        ('Idempotent',
         'An operation that produces the same result whether applied once or '
         'many times.'),
        ('IFRS',
         'International Financial Reporting Standards. The reporting framework '
         'airlines use, including IFRS 16 on leases.'),
        ('JSDoc',
         'Comments in a special format that describe types and parameters. In '
         'AMS these drive the type-check gate without a compilation step.'),
        ('Largest-remainder allocation',
         'The method for splitting a total so the parts sum exactly to it, '
         'giving leftover units to the largest fractional shares. See '
         '`allocate()` in `money.js`.'),
        ('LLP (Life-Limited Part)',
         'A component with a hard life limit in cycles, hours or calendar '
         'months. Exceeding it requires destruction of the part.'),
        ('Load factor (PLF)',
         'Revenue passenger kilometres divided by available seat kilometres. '
         'Stored in AMS as integer parts per million.'),
        ('MEL (Minimum Equipment List)',
         'The list of items an aircraft may fly with unserviceable, subject to '
         'rectification deadlines by Category A, B, C or D.'),
        ('Microcents',
         'One hundredth of a cent. Used for unit costs so that a long-haul '
         'CASK does not round to zero.'),
        ('Ppm (parts per million)',
         'A rate expressed as an integer. 850,000 ppm is 85%. Used throughout '
         'AMS for ratios, thresholds and margin.'),
        ('RASK',
         'Revenue per available seat kilometre. The revenue side of the CASK '
         'comparison; the gap between them is the margin.'),
        ('RPK (Revenue Passenger Kilometre)',
         'Paying passengers multiplied by distance flown. The demand side, and '
         'the only passenger capacity measure that carries revenue.'),
        ('SB (Service Bulletin)',
         'A manufacturer instruction. Often technically equivalent to an AD '
         'but not legally mandatory on its own.'),
        ('Safe integer',
         'A number JavaScript can hold exactly. Up to 9,007,199,254,740,991. '
         '`Number.isSafeInteger` checks it.'),
        ('Segment', 'One flight between two consecutive points.'),
        ('Segregation of duties',
         'The control requiring different people to authorise and approve the '
         'same transaction. See `SOD_RULES` in `domain.js`.'),
        ('SHA-256',
         'A hashing algorithm. Produces a 64-character fingerprint that changes '
         'completely if the input changes by one character.'),
        ('TOCTOU',
         'Time-of-check to time-of-use. The race where a value is checked, then '
         'changed before it is used. The reason `FOR UPDATE` is necessary.'),
        ('Transaction',
         'A set of database operations that either all succeed or all fail. '
         'AMS requires the commitment and its audit entry in one transaction.'),
        ('ULL', 'Ultra Long Haul. Flights beyond roughly six hours.'),
        ('Utilisation',
         'Block hours flown per aircraft per day. The strongest single driver '
         'of unit cost.'),
    ]:
        story += PARAGRAPH_TERM(term, definition)

    story += RULEHR()

    story += H2('Where to go from here')

    story += BUL([
        '**For a new engineer:** read Parts II and III, then the module headers '
        'in `shared/src/` in the order they appear in `costing.js`. Those '
        'headers are unusually good documentation and they explain intent.',
        '**For a reviewer:** read Part XIII, then open '
        '`shared/src/routing/constrained-path.js` and check the code against the '
        'proof in its header. That is the module most worth reviewing carefully.',
        '**For a manager:** you now know what the system measures, why the '
        'money is stored as integers, what the tests actually prove, and where '
        'a qualified human is still required. Ask for the open-questions list '
        'for your aviation finance and compliance reviewers before the system '
        'informs a real decision.',
    ])


def PARAGRAPH_TERM(term, definition):
    """A glossary entry: bold term, then the definition."""
    from framework import S, _rich
    from reportlab.platypus import Paragraph, Spacer
    return [Paragraph(f'<b>{term}</b><br/>{_rich(definition)}', S['bullet']),
            Spacer(1, 3)]