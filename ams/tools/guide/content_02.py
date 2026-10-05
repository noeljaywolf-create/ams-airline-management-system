"""
Part II — the JavaScript language itself, taught through AMS code.
"""

from framework import (BUL, CALLOUT, CODE, H1, H2, H3, LEAD, NUMLIST, P,
                       RULEHR, SPACER, TABLE)


def build(story):
    # ================= PART II =================
    story += H1('Part II — The language, from the beginning')

    story += LEAD(
        'JavaScript has about a dozen core ideas. This part covers all of '
        'them, using code from AMS. Each section introduces the idea in plain '
        'language first, then shows it in real code.')

    # --- variables ---
    story += H2('What a variable actually is')

    story += P(
        'A variable is a name attached to a value. That is genuinely all it '
        'is. The name lets you refer to the value later without repeating it.')

    story += CODE(
        '''const PASSENGER_ALL_UP_KG = 100;     // ~75 kg person + ~25 kg baggage
const BURN_KG_PER_KG_PAYLOAD = 0.030; // ~3.0% of payload as incremental fuel

export function estimateMarginalSeatCost(input) {
  const fuelPricePerKg = input.fuelPriceCentsPerKg ?? 0;
  const fuel = Math.round(PASSENGER_ALL_UP_KG * BURN_KG_PER_KG_PAYLOAD * fuelPricePerKg);''',
        'shared/src/costing.js')

    story += P(
        'Two words govern how a name may be used, and the difference matters '
        'when you review code.')

    story += TABLE(
        ['Keyword', 'Meaning', 'Use in AMS'],
        [
            ['`const`', 'The name is fixed; the value may not be reassigned.',
             'Used everywhere. A name that never changes is never a '
             'surprise.'],
            ['`let`', 'The name is fixed but the value may be reassigned.',
             'Used rarely, only where reassignment is genuinely intended, '
             'such as a running total in a loop.'],
            ['`var`', 'The older, function-scoped form.',
             'Never used. It has confusing scope rules and no advantage.'],
        ],
        widths=[13, 40, 47])

    story += CODE(
        '''let fuelOnBoard = 0; // arriving at stop 0 with empty tanks

for (let i = 0; i < n - 1; i += 1) {
  const price = priceCentsPerKg[i];
  // ... fuelOnBoard genuinely changes here ...
  fuelOnBoard = departure - legFuelKg[i];
}''',
        'shared/src/routing/refuel.js — `let` is correct for fuelOnBoard, '
        'because it is reassigned each iteration.')

    story += CALLOUT(
        'good', 'Why this matters when you review code',
        'Naming conventions in this codebase: `const` by default, `let` only '
        'when a value must change. If you see `var`, it is an error. If you '
        'see a `let` that is never reassigned, that is also worth querying — '
        'it often signals a design that has drifted.')

    # --- numbers ---
    story += H2('Numbers are the one thing to fear')

    story += P(
        'Every number in JavaScript that looks ordinary is stored in a format '
        'that cannot represent most decimal fractions exactly. The format is '
        'called IEEE 754 double precision. It is a hardware standard, deeply '
        'optimised for speed, and it is exactly wrong for money.')

    story += CODE(
        '''> 0.1 + 0.2
0.30000000000000004

> 0.1 * 3
0.30000000000000004

> 1.005 * 100
100.49999999999999''',
        'What a JavaScript console shows. These are not printing errors — the '
        'stored values genuinely are those numbers.')

    story += P(
        'The error is tiny. It does not matter when you are animating a '
        'circle. It matters enormously when you are adding ten million '
        'amounts and expecting the total to match an invoice.')

    story += H3('The range problem')

    story += P(
        'The other limitation is size. A number can hold integers exactly only '
        'up to a certain value. Beyond that, digits are silently lost.')

    story += CODE(
        '''// The largest integer a JavaScript number holds exactly:
Number.MAX_SAFE_INTEGER   // 9007199254740991  (about 9 quadrillion)

> 9007199254740992 + 1
9007199254740992          // the +1 vanished

> 0.1 + 0.2 === 0.3
false''')

    story += P(
        'Nine quadrillion cents is ninety billion dollars. That is far more '
        'than any airline holds, so the range is not a practical problem for '
        'AMS. The important consequence is the *checking* discipline that '
        'follows from caring about the limit at all.')

    story += CODE(
        '''function assertSafeInteger(v, what = 'amount') {
  if (typeof v !== 'number' || !Number.isSafeInteger(v)) {
    throw new MoneyError(
      `${what} must be a safe integer number of cents; received ${typeof v} ${String(v)}. ` +
        'Floating-point money is forbidden — parse from a string with cents().',
      'MONEY_NOT_SAFE_INTEGER',
    );
  }
}''',
        'shared/src/money.js — this check runs before essentially every '
        'monetary calculation in the system.')

    story += CALLOUT(
        'note', 'What "safe integer" means precisely',
        'A number is "safe" if it is a whole number (no fractional part) and '
        'can be represented exactly. `Number.isSafeInteger` returns true only '
        'in that case. A value of 10.5 returns false — not because it is '
        '"unsafe" in a security sense, but because it is not an integer and '
        'AMS never permits a fractional cent.')

    story += H3('Rounding is a decision, not an accident')

    story += P(
        'When a division cannot produce a whole number, JavaScript can return '
        'it with a decimal part, or you can ask it to round. Which you choose '
        'changes the answer, so AMS writes the rounding explicitly at every '
        'point where it happens.')

    story += CODE(
        '''Math.floor(x)      // round down
Math.ceil(x)       // round up
Math.round(x)      // round to nearest
Math.trunc(x)      // discard the fractional part''')

    story += P(
        'These four look interchangeable and are not. `Math.round(-0.5)` gives '
        '`-0`, not `1`. `Math.floor(-0.5)` gives `-1`, not `0`. For money, AMS '
        'often avoids the built-ins and states the rule itself.')

    story += CODE(
        '''// Half-up on the absolute value so the sign is symmetric.
const rounded = numerator >= 0
  ? Math.floor(numerator / denominator + 0.5)
  : -Math.floor(Math.abs(numerator) / denominator + 0.5);
return rounded;''',
        'shared/src/money.js, applyPpm(). This rounds +2.5 to 3 and -2.5 to '
        '-3. The built-in Math.round would give -2 for the second case.')

    story += CALLOUT(
        'warn', 'A rounding rule you do not state is a rounding rule you cannot audit',
        'When a finance manager asks "why is this invoice total one cent '
        'different from the sum of the lines?", the answer has to be '
        'reproducible from the code. "It just rounds" is not an answer. AMS '
        'names the rule at the point of use so it can be explained.')

    # --- text ---
    story += H2('Text, and how code reads it')

    story += P(
        'Text in JavaScript is called a string. Strings are written in quotes, '
        'and the quotes do not appear in the value.')

    story += CODE(
        '''const text = 'finance_treasury';
const len = text.length;          // 17
const upper = text.toUpperCase();  // 'FINANCE_TREASURY'
const part = text.slice(0, 7);     // 'finance'
const joined = [1, 2, 3].join('-'); // '1-2-3'
const padded = '7'.padStart(3, '0'); // '007' ''')

    story += P(
        'Template literals are the modern way to build a string. They use '
        'backticks and allow a value to be inserted directly.')

    story += CODE(
        '''throw new MoneyError(
  `Monetary amount out of safe integer range: "${input}"`,
  'MONEY_OVERFLOW',
);''',
        'shared/src/money.js. `${input}` inserts the value of the variable '
        'named input. Note the deliberate quotes around it, so the reader can '
        'see exactly what was received.')

    story += H3('Regular expressions: matching a pattern')

    story += P(
        'A regular expression is a compact description of a shape of text. '
        'AMS uses them where hand-written checking would be long and '
        'error-prone.')

    story += CODE(
        '''const cleaned = raw.replace(/[\\s,_]/g, '');
const match = /^(-?)(\\d*)(?:\\.(\\d{1,2}))?$/.exec(cleaned);
if (!match) throw new MoneyError(`Cannot parse monetary amount: "${input}"`, 'MONEY_UNPARSEABLE');

const [, sign, whole = '0', frac = ''] = match;''',
        'shared/src/money.js — parsing "1234.56". Read it as: optionally a '
        'minus sign, then some digits, then optionally a dot and one or two '
        'digits, and nothing else.')

    story += TABLE(
        ['Symbol', 'Means', 'In this pattern'],
        [
            ['`^`', 'start of the text', 'the value must begin here'],
            ['`$`', 'end of the text', 'and end there'],
            ['`-?`', 'a minus sign, optional', 'captured as group 1'],
            ['`\\d*`', 'zero or more digits', 'group 2, the whole amount'],
            ['`\\.?`', 'a dot, optional', 'inside a non-capturing group'],
            ['`\\d{1,2}`', 'one or two digits', 'group 3, the cents'],
            ['`...`', 'the remainder of the code', 'skipped deliberately'],
        ],
        widths=[14, 34, 52])

    story += CODE(
        '''const [, sign, whole = '0', frac = ''] = match;''',
        'The leading comma is a hole: the first item (the whole match) is '
        'skipped, and the three named values are taken from positions 1, 2 and '
        '3. `= \'0\'` supplies a default when a group did not participate in '
        'the match.')

    story += CALLOUT(
        'note', 'Why not use Number() to parse money?',
        '`Number("1234.56")` gives a float, and the fraction is inexact. The '
        'whole point of the regex is to keep the digits as *text* — the '
        'characters "1234" and "56" — and only then combine them into an '
        'integer. No fractional value is ever created.')

    # --- decisions ---
    story += H2('Decisions: if, and the shape of a condition')

    story += CODE(
        '''if (ad.superseded) {
  return { applies: false, reason: 'Superseded by a later directive', complianceStatus: null };
}
if (ad.aircraftType !== aircraft.aircraftType) {
  return { applies: false, reason: `Not applicable to ${aircraft.aircraftType}`, complianceStatus: null };
}''',
        'shared/src/airworthiness.js. Each condition tests one thing and then '
        'returns immediately.')

    story += P(
        'That early-return style is used deliberately and consistently. The '
        'alternative — a long chain of `else if` — becomes unreadable past '
        'about three branches, and in a system that decides whether an '
        'aircraft may fly, readability is a safety property.')

    story += CODE(
        '''let verdict;
if (agg.flights === 0) verdict = 'NO_DATA';
else if (agg.contributionCents < 0) verdict = 'LOSS_MAKING';
else if (agg.loadFactorPpm < targetLoadFactorPpm) verdict = 'MARGINAL';
else verdict = 'PROFITABLE';''',
        'shared/src/costing.js — a verdict chain. Order matters: the first '
        'matching condition wins, so "no data" must be checked before '
        '"loss making".')

    story += H3('Comparison operators')

    story += TABLE(
        ['Written', 'Means', 'Common mistake'],
        [
            ['`=`', 'assign a value', 'using it to compare; this is the single '
             'most common JavaScript bug'],
            ['`==`', 'compare, with type conversion',
             '`0 == "0"` is true; AMS never uses it'],
            ['`===`', 'compare, type must match too',
             'always used in AMS'],
            ['`!==`', 'the negation of `===`', 'always used in AMS'],
            ['`<` `<=` `>` `>=`', 'order comparison',
             'works on strings by alphabetical order, which surprises people'],
        ],
        widths=[15, 34, 51])

    story += CODE(
        '''if (commitment.amount_cents !== amountCents) {''')

    story += P(
        'This is the single most important line of JavaScript to internalise '
        'as a non-programmer, because it is the one that appears most often in '
        'accidents. `=` sets something. `==` is a discouraged loose '
        'comparison. `===` asks "are these exactly the same, type included". '
        'In AMS you will see `===` and `!==` in every conditional, and you '
        'should expect to see nothing else.')

    story += H3('The ternary operator')

    story += CODE(
        '''bufferPpm = ctx.expectedBurnVariancePpm ?? 30_000; // default +3%

varianceDirection: varianceKg > 0 ? 'OVER' : varianceKg < 0 ? 'UNDER' : 'ON_PLAN',

const symbol = { USD: '$', EUR: '€', GBP: '£', ZWG: 'ZWG ' }[currency] ?? `${currency} `;''',
        '`condition ? valueIfTrue : valueIfFalse`. Used where it is short and '
        'clear, avoided where it would need a nested chain.')

    # --- loops ---
    story += H2('Loops, and when not to use one')

    story += CODE(
        '''for (let i = 0; i < n - 1; i += 1) {
  const price = priceCentsPerKg[i];
  // ... do work ...
}

for (const entry of Object.entries(lines)) {
  if (FLIGHT_ATTR.has(category)) byCategory.FLIGHT_ATTRIBUTABLE += amount;
}''',
        'Two loop forms. The first counts. The second visits each element of '
        'a collection.')

    story += CODE(
        '''flights.reduce(
  (acc, f) => ({
    flights: acc.flights + 1,
    asks: acc.asks + f.asks,
    rpks: acc.rpks + f.rpks,
    revenueCents: acc.revenueCents + f.revenueCents,
  }),
  { flights: 0, asks: 0, rpks: 0, revenueCents: 0 },
);''',
        'shared/src/costing.js — `reduce` folds a list into a single value. '
        'The first argument is a function; the second is the starting value.')

    story += P(
        '`reduce` is the most powerful and least readable tool in this '
        'codebase. It appears almost exclusively in one situation: summing a '
        'group of figures into a total. Where AMS uses it, it is because the '
        'alternative would be a loop that builds an object field by field — '
        'which is more code and more room for a mistake.')

    story += CALLOUT(
        'note', 'Reading a reduce without reading JavaScript',
        'The pattern is always the same. The function receives two things: '
        '`acc`, which is everything computed so far, and `f`, the current '
        'element. It returns the new value of `acc`. The second argument is '
        'where counting starts. Read it as: "starting from zero, for each '
        'flight, add its figures to the running total."')

    # --- functions ---
    story += H2('Functions: naming a piece of work')

    story += P(
        'A function is a named, reusable piece of work. AMS uses functions as '
        'the primary unit of organisation, and each one is expected to do a '
        'single well-defined thing.')

    story += CODE(
        '''/**
 * Distribute `total` across `weights` so that the parts sum to EXACTLY
 * the total, using the largest-remainder method.
 *
 * This is the single most important function in the costing engine.
 * When you split a monthly fuel cost across 400 flights you cannot
 * round each flight's share independently: 400 x 1 cent of rounding
 * drift becomes 4 dollars that cannot be reconciled to the supplier
 * invoice. Largest-remainder guarantees zero leakage.
 *
 * @param {Cents} total must be >= 0
 * @param {number[]} weights non-negative
 * @returns {Cents[]} same length as weights, sums to total
 */
export function allocate(total, weights) {''',
        'shared/src/money.js. The comment above the function explains not what '
        'it does but why it must exist that way.')

    story += P(
        'That comment convention is worth understanding, because it is a '
        'deliberate cultural choice in this codebase. A comment that restates '
        'the code is noise. A comment that explains *why this approach rather '
        'than the obvious one* prevents the next engineer from "simplifying" '
        'it into a bug.')

    story += H3('Arguments, and the ones you cannot do without')

    story += CODE(
        '''export function cents(input) { ... }

export function sum(...values) { ... }

export function assertReconciles(parts, expected, context = 'reconciliation') { ... }''')

    story += TABLE(
        ['Form', 'What it means', 'Example'],
        [
            ['`cents(input)`', 'one required argument', 'the amount to parse'],
            ['`sum(...values)`', 'any number of arguments, gathered into an '
             'array', '`sum(1, 2, 3)`'],
            ['`context = \'reconciliation\'`', 'optional, with a default',
             'used if the caller omits it'],
        ],
        widths=[30, 38, 32])

    story += H3('Returning more than one value')

    story += CODE(
        '''export function solveRoute({ flights, source, destination, tankCapacityKg, minReserveKg }) {
  // ...
  return {
    feasible: true,
    costCents: label.costCents,
    fuelUsedKg: label.fuelUsedKg,
    stops: reconstructStops(label),
    labelsExpanded, labelsPruned, maxFrontier,
  };
}''',
        'JavaScript has one return value, so functions that produce several '
        'related facts return a single object. Callers then read the fields by '
        'name.')

    story += CODE(
        '''const result = solveRoute({ flights, source, destination, tankCapacityKg, minReserveKg });
result.feasible   // true
result.costCents  // 112000
result.stops      // ['JFK', 'YUL', 'GRU']''',
        'The destructured parameter deserves a note: `{ flights, source, ... }` '
        'means "the caller passes one object, and I take these named values '
        'out of it". This avoids a long list of arguments that must be passed '
        'in the right order.')

    # --- objects ---
    story += H2('Objects: labelled collections')

    story += CODE(
        '''/**
 * @typedef {Object} FuelPlan
 * @property {number} taxiFuelKg
 * @property {number} tripFuelKg
 * @property {number} contingencyKg
 * @property {number} alternateKg
 * @property {number} finalReserveKg   Regulatory minimum landing reserve
 * @property {number} [etopsReserveKg] Only on ETOPS routes
 * @property {number} upliftKg         Total taken on board
 * @property {number} priceCentsPerKg  Realised uplift price
 */''',
        'shared/src/fuel.js. This describes the shape of a fuel plan: what '
        'fields exist, what type each is, and which are optional. The comment '
        'after each field is a business note, not a technical one.')

    story += CODE(
        '''const plan = {
  taxiFuelKg: 250,
  tripFuelKg: 7800,
  contingencyKg: 300,
  alternateKg: 620,
  finalReserveKg: 1500,
  upliftKg: 10470,
  priceCentsPerKg: 95,
};

plan.tripFuelKg          // 7800
plan.etopsReserveKg      // undefined — never provided
plan.etopsReserveKg ?? 0 // 0 — substitute when absent''')

    story += H3('The difference between absent and zero')

    story += P(
        'This is subtle and it matters. A field that was never provided is '
        '`undefined`. A field explicitly set to zero is `0`. They behave '
        'differently in a check.')

    story += CODE(
        '''if (plan.etopsReserveKg !== undefined) { ... }  // present, even if 0
if (plan.etopsReserveKg) { ... }                    // truthy: skips 0

const etops = plan.etopsReserveKg ?? 0;   // 0 only when undefined
const zero  = plan.etopsReserveKg || 0;   // 0 whenever falsy''')

    story += CALLOUT(
        'note', 'Why AMS prefers ?? in financial code',
        '`??` substitutes a default only when the value is absent or null. '
        '`||` substitutes whenever the value is anything falsy — including a '
        'legitimate zero. In a ledger where zero is a meaningful amount, '
        'collapsing zero into a default can hide a real data problem. AMS '
        'uses `??` where zero carries meaning.')

    story += H3('Spreading and merging')

    story += CODE(
        '''const required = 3200 + 8600 + 1500;

const required = i === n - 1
  ? reserveKg
  : Math.max(reserveKg, required[i + 1]);
required[i] = legFuelKg[i] + neededBeyond;

return {
  ...totals,
  loadFactorPpm: ...,
  caskMicrocents: caskMicrocents(totals.operatingCostCents, totals.asks),
};''',
        'Three spreads in one sample. `...totals` copies every field of the '
        'totals object into the new one; then specific fields overwrite or add '
        'to them.')

    # --- arrays ---
    story += H2('Arrays: ordered collections')

    story += CODE(
        '''export const FLIGHT_ATTRIBUTABLE_CATEGORIES = [
  'fuel', 'crew_flight', 'crew_cabin', 'crew_training', 'maintenance_direct',
  'maintenance_reserve', 'airport_charges', 'navigation_charges', 'catering',
  'handling', 'de_icing',
];''',
        'shared/src/domain.js. This is the single source of truth for which '
        'costs count as variable with the flight.')

    story += P(
        'The array methods AMS relies on, and what each does:')

    story += TABLE(
        ['Method', 'What it returns', 'In AMS'],
        [
            ['`.map(f)`', 'a new array of the same length, each element passed '
             'through `f`', 'convert cost lines into category totals'],
            ['`.filter(p)`', 'a new array containing only elements where `p` '
             'is true', 'keep only applicable directives'],
            ['`.reduce(f, start)`', 'a single accumulated value',
             'sum a list into a total'],
            ['`.find(p)`', 'the first element where `p` is true',
             'locate a specific budget line'],
            ['`.includes(v)`', 'true if the value is present',
             'check a driver name is permitted'],
            ['`.sort(cmp)`', 'the array, reordered in place',
             'rank deadlines; **always supply a comparator**'],
            ['`.at(-1)`', 'the last element',
             'the most recent entry in an audit chain'],
        ],
        widths=[22, 40, 38])

    story += CALLOUT(
        'bug', 'The one array trap worth knowing about',
        '`sort()` with no argument sorts alphabetically, so [100, 9, 10] '
        'becomes [10, 100, 9]. It also changes the original array rather than '
        'a copy. AMS passes an explicit comparator and, where the original '
        'must survive, copies first: `[...flights].sort(...)`.')

    story += CODE(
        '''const scoped = allEntries
  .filter((e) => e.tenantId === tenantId)
  .sort((a, b) => a.id - b.id);

const ordered = [...lines].sort((a, b) => a.lineId.localeCompare(b.lineId));''',
        'backend/src/audit/chain.js and cost-authority.js. Read the comparator '
        '`(a, b) => a.id - b.id` as: "if a comes before b, return a negative '
        'number; if after, positive".')

    # --- undefined/null/NaN ---
    story += H2('The special values undefined, null, and NaN')

    story += P(
        'JavaScript has several values that mean "no value", and they are not '
        'interchangeable. Precision here directly affects correctness.')

    story += TABLE(
        ['Value', 'Means', 'Arises when'],
        [
            ['`undefined`', 'nothing was provided',
             'a field omitted, a function with no return, an array past its end'],
            ['`null`', 'deliberately empty',
             'the code sets it, usually to record "no applicable deadline"'],
            ['`NaN`', 'the result of a calculation that has no meaning',
             '`0 / 0`, `Math.sqrt(-1)`, `parseInt("abc")`'],
        ],
        widths=[16, 28, 56])

    story += CODE(
        '''const target = best.get(destination);
if (!target || target.size === 0) return EMPTY;

nextDue: [...overdue, ...dueSoon].sort((a, b) => a.remainingPpm - b.remainingPpm)[0] ?? null,''',
        'shared/src/airworthiness.js. The first line handles the case where '
        'nothing was found at all; the second records an explicit "none" rather '
        'than leaving it undefined.')

    story += P(
        'In AMS, `null` is used where a missing value is a meaningful business '
        'fact — no next deadline exists, no directive applies. `undefined` is '
        'used where information simply was not supplied. The distinction lets '
        'a reviewer tell "we looked and found nothing" from "nobody looked".')

    # --- modules ---
    story += H2('Modules: how files talk to each other')

    story += P(
        'Each AMS file is a module. A module exports some things and keeps the '
        'rest private. Nothing outside can reach a private helper.')

    story += CODE(
        '''import { allocate, assertReconciles, MoneyError, sum } from './money.js';
import { flightMetrics } from './metrics.js';
import {
  ALLOCATION_DRIVERS,
  FLIGHT_ATTRIBUTABLE_CATEGORIES,
  FLEET_FIXED_CATEGORIES,
  PERIOD_CATEGORIES,
} from './domain.js';''',
        'shared/src/costing.js — the top of the file. Three imports: named '
        'values from specific files.')

    story += CODE(
        '''import { createHash } from 'node:crypto';

/** @typedef {Cents} Cents Integer minor units. Never a float result. */

export function cents(input) { ... }        // exported: anyone may use it

function assertSafeInteger(v, what = 'amount') { ... }  // private to this file''')

    story += CODE(
        '''const FLIGHT_ATTR = new Set(FLIGHT_ATTRIBUTABLE_CATEGORIES);
const FLEET_FIXED = new Set(FLEET_FIXED_CATEGORIES);
const PERIOD = new Set(PERIOD_CATEGORIES);

for (const [category, amount] of Object.entries(lines)) {
  if (FLIGHT_ATTR.has(category)) byCategory.FLIGHT_ATTRIBUTABLE += amount;
  else if (FLEET_FIXED.has(category)) byCategory.FLEET_FIXED += amount;
  else if (PERIOD.has(category)) byCategory.PERIOD += amount;
  else byCategory.UNKNOWN += amount;
}''',
        'shared/src/costing.js. Arrays become Sets once at the top of the file, '
        'then membership is tested directly. Converting an array to a Set for '
        'repeated `has` checks is a standard optimisation, and it also reads '
        'closer to intent: "is this a flight-attributable category?"')

    story += CALLOUT(
        'note', 'The one thing to notice about imports',
        'Every import ends with `.js`. The full filename is written out. This '
        'is deliberate and is what makes the code work directly in Node with no '
        'bundler and no configuration. Nothing is inferred, so nothing can be '
        'guessed wrong.')

    story += H3('The dependency direction')

    story += P(
        'AMS has a strict one-way dependency structure, and it is the reason '
        'the money rules cannot be bypassed.')

    story += CODE(
        '''backend/src/modules/finance/cost-authority.js
  └── imports shared/src/money.js          (may use money)

shared/src/costing.js
  └── imports shared/src/money.js          (may use money)

shared/src/money.js
  └── imports nothing                      (the foundation)''')

    story += P(
        'Nothing imports `money.js` *into* it. It is the base of the '
        'dependency graph. This is what makes "the only module permitted to do '
        'arithmetic on money" a fact about the architecture rather than a '
        'promise in a comment.')

    story += RULEHR()