"""
Part III (money) and Part IV (metrics).
"""

from framework import (BUL, CALLOUT, CODE, H1, H2, H3, LEAD, NUMLIST, P,
                       RULEHR, SPACER, TABLE)


def build(story):
    # ================= PART III =================
    story += H1('Part III — Money, the discipline that defines this codebase')

    story += LEAD(
        'If you read one part of this guide, read this one. Almost every '
        'design decision in AMS traces back to the requirement that money must '
        'be exact.')

    story += H2('Why nobody uses decimals for money in code')

    story += P(
        'Every general-purpose programming language has this problem, because '
        'computer hardware stores numbers in binary and 0.1 has no finite '
        'binary representation. The usual workaround is to hold money as a '
        'whole number of minor units.')

    story += CODE(
        '''// The same amount, three ways
const a = 0.1 + 0.2;          // 0.30000000000000004
const b = 10 + 0.2;           // 10.2   (looks fine)
const c = 1.1 * 3;            // 3.3000000000000003

// Add a penny ten million times
let total = 0;
for (let i = 0; i < 10_000_000; i += 1) total += 0.01;
total                          // 99999.9999999999 — 1/100 of a cent adrift''')

    story += P(
        'The error is individually invisible. It only becomes visible in '
        'aggregate, which is exactly when you least want it: a trial balance '
        'that refuses to foot, or an invoice total that differs from the sum of '
        'its lines by a few cents.')

    story += H2('Cents: the integer unit AMS chose')

    story += CODE(
        '''/**
 * AMS — Integer money arithmetic.
 *
 * THE ONLY MODULE PERMITTED TO PERFORM ARITHMETIC ON MONETARY VALUES.
 *
 * Rule: every monetary amount is an integer number of minor units
 * (US cents). Floating point is never used for money anywhere in AMS.
 *
 * Why this matters concretely, not in theory:
 *
 *   0.1 + 0.2 !== 0.3            // IEEE-754 binary representation error
 *
 * In a ledger, that error compounds across a million transactions and
 * the trial balance stops footing. Under IFRS the ledger must balance
 * exactly. The defence is structural: the type system has no way to
 * represent a fractional cent, and the one function that parses money
 * from a string uses integer arithmetic to do it.
 *
 * @module money
 */''',
        'shared/src/money.js — the file header. Everything the team needs to '
        'know about the money rule is stated before a single function.')

    story += P(
        'The key architectural point is in that third paragraph: the defence '
        'is *structural*. It is not a code review instruction or a lint rule. '
        'There is simply no function in AMS that accepts a fractional cent, '
        'because every path into a monetary value passes through a check.')

    story += CODE(
        '''function assertSafeInteger(v, what = 'amount') {
  if (typeof v !== 'number' || !Number.isSafeInteger(v)) {
    throw new MoneyError(
      `${what} must be a safe integer number of cents; received ${typeof v} ${String(v)}. ` +
        'Floating-point money is forbidden — parse from a string with cents().',
      'MONEY_NOT_SAFE_INTEGER',
    );
  }
}

export function add(a, b) { assertSafeInteger(a); assertSafeInteger(b); return a + b; }
export function subtract(a, b) { assertSafeInteger(a); assertSafeInteger(b); return a - b; }

export function multiplyWhole(value, factor) {
  assertSafeInteger(value);
  if (!Number.isInteger(factor)) {
    throw new MoneyError(`Multiplier must be a whole number; received ${factor}`, 'MONEY_NON_INTEGER_FACTOR');
  }
  return value * factor;
}''',
        'shared/src/money.js. Even addition refuses to proceed unless both '
        'operands are whole cents.')

    story += CALLOUT(
        'note', 'Why multiplyWhole exists at all',
        'Money must sometimes be multiplied — by a quantity of seats, a number '
        'of hours, a rate. But "multiply a cent amount by 1.5" has no meaning '
        'in a ledger; it produces half a cent. The function therefore permits '
        'only whole-number multipliers. If you need a fractional result, you '
        'have a percentage, and there is a separate function for that (below). '
        'This makes the illegal operation impossible to express rather than '
        'merely discouraged.')

    story += H2('Parsing a human amount safely')

    story += CODE(
        '''export function cents(input) {
  const raw = typeof input === 'number' ? input.toFixed(2) : String(input);
  const cleaned = raw.replace(/[\\s,_]/g, '');
  const match = /^(-?)(\\d*)(?:\\.(\\d{1,2}))?$/.exec(cleaned);
  if (!match) throw new MoneyError(`Cannot parse monetary amount: "${input}"`, 'MONEY_UNPARSEABLE');

  const [, sign, whole = '0', frac = ''] = match;
  if (whole === '' && frac === '') {
    throw new MoneyError(`Cannot parse monetary amount: "${input}"`, 'MONEY_UNPARSEABLE');
  }
  // Pad/truncate fractional part to exactly 2 digits.
  const frac2 = (frac + '00').slice(0, 2);
  const value = Number(whole || '0') * 100 + Number(frac2);
  const signed = sign === '-' ? -value : value;
  if (!Number.isSafeInteger(signed)) {
    throw new MoneyError(`Monetary amount out of safe integer range: "${input}"`, 'MONEY_OVERFLOW');
  }
  return signed;
}''',
        'shared/src/money.js — the single point at which human text becomes '
        'money in AMS.')

    story += P('Line by line, for a reader who does not write code:')

    story += NUMLIST([
        '**Decide how to read the input.** If a number was passed, it is '
        'converted to text first with two decimal places. If text was passed, '
        'it is used as-is. Working in text is the whole point.',
        '**Remove cosmetic characters.** Spaces, commas and underscores are '
        'stripped, so `"1,234.56"` and `"1 234.56"` and `"1234.56"` all parse '
        'identically. This is real-world tolerance for how people type.',
        '**Match the pattern.** Only an optional minus sign, digits, and '
        'optionally one or two decimal digits. Anything else — a third decimal '
        'place, letters, an exponent — is rejected outright.',
        '**Reject empty matches.** `"."` or `"-"` alone must not become zero.',
        '**Pad the fraction.** `"7"` becomes `"07"`, so 7 dollars is 700 cents '
        'rather than 7.',
        '**Combine as integers.** `Number("1234") * 100 + Number("56")` gives '
        '123456. No fractional value exists at any point.',
        '**Check the range.** If the result exceeds the safely-representable '
        'limit, throw rather than silently losing digits.',
    ])

    story += CODE(
        '''cents('1234.56')        // 123456
cents('1,234.56')       // 123456
cents('1 234.56')       // 123456
cents('-78.90')         // -7890
cents('.50')            // 50
cents('7')              // 700
cents('12.5')           // 1250
cents('12.345')         // throws — three decimal places
cents('abc')            // throws
cents('')               // throws''')

    story += H3('Rendering money back to text')

    story += CODE(
        '''export function format(value, currency = 'USD') {
  assertSafeInteger(value);
  const negative = value < 0;
  const abs = Math.abs(value);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  const grouped = String(whole).replace(/\\B(?=(\\d{3})+(?!\\d))/g, ',');
  const symbol = { USD: '$', EUR: '€', GBP: '£', ZWG: 'ZWG ' }[currency] ?? `${currency} `;
  return `${negative ? '-' : ''}${symbol}${grouped}.${String(frac).padStart(2, '0')}`;
}''',
        'shared/src/money.js.')

    story += P(
        'Note that this does no arithmetic on a fraction. The whole part and '
        'the cents part are separated by `Math.floor` and the remainder '
        'operator `%`, both of which are exact for integers. The formatting '
        'regex inserts thousands separators. A cents value of 5 renders as '
        '".05", never as ".5".')

    story += H2('Rounding: the rules AMS applies')

    story += P(
        'Rounding is unavoidable in real finance: you cannot invoice half a '
        'cent. What matters is that the rule is stated and applied uniformly.')

    story += CODE(
        '''// Fuel is the classic integer-arithmetic trap. fuelKg x priceCentsPerKg
// is fractional. We must round ONCE, here, at the point the fact is
// created — not per-line later, and never by float.
const fuelCents = Math.round(fuelKg * fuelPricePerKg);
if (!Number.isSafeInteger(fuelCents)) {
  throw new MoneyError('Fuel cost overflow — split the uplift across delivery notes', 'COST_FUEL_OVERFLOW');
}''',
        'shared/src/costing.js. The comment states the policy: round once, at '
        'the point the fact is created.')

    story += CALLOUT(
        'warn', 'Why "round once, at the point of creation"',
        'The alternative is to keep exact fractions throughout and round at '
        'the end. That is often more accurate in isolation, but it forces '
        'every downstream consumer to handle fractional cents — and any '
        'consumer that forgets becomes the source of a discrepancy. Rounding '
        'once, early, means everything downstream works with values that are '
        'already real.')

    story += H3('Half-up, symmetric about zero')

    story += CODE(
        '''export function applyPpm(value, ratePpm) {
  assertSafeInteger(value);
  if (!Number.isInteger(ratePpm)) {
    throw new MoneyError(`Rate must be integer ppm; received ${ratePpm}`, 'MONEY_NON_INTEGER_RATE');
  }
  const numerator = value * ratePpm;
  const denominator = 1_000_000;
  // Half-up on the absolute value so the sign is symmetric.
  const rounded = numerator >= 0
    ? Math.floor(numerator / denominator + 0.5)
    : -Math.floor(Math.abs(numerator) / denominator + 0.5);
  return rounded;
}''',
        'shared/src/money.js. This applies a rate expressed in parts per '
        'million, used for currency conversion, fuel escalators and '
        'indexation.')

    story += P(
        'The comment "half-up on the absolute value so the sign is symmetric" '
        'describes a real problem. JavaScript\'s built-in `Math.round` rounds '
        '2.5 to 3 but -2.5 to -2. Applying the rule to the magnitude and then '
        'restoring the sign gives -3, which is what a finance team expects when '
        'they say "round half up".')

    story += H2('Splitting money without losing a cent')

    story += P(
        'This is the single most important function in the costing engine, and '
        'it deserves a full explanation.')

    story += CODE(
        '''export function allocate(total, weights) {
  assertSafeInteger(total, 'total');
  if (total < 0) throw new MoneyError('Cannot allocate a negative total', 'MONEY_NEGATIVE_TOTAL');
  if (weights.length === 0) {
    if (total !== 0) throw new MoneyError('Cannot allocate non-zero total across zero weights', 'MONEY_NO_WEIGHTS');
    return [];
  }
  if (weights.some((w) => !Number.isFinite(w) || w < 0)) {
    throw new MoneyError('Allocation weights must be finite and non-negative', 'MONEY_BAD_WEIGHT');
  }

  const weightSum = weights.reduce((a, b) => a + b, 0);
  if (weightSum === 0) {
    if (total !== 0) {
      throw new MoneyError('Cannot allocate non-zero total across zero total weight', 'MONEY_ZERO_WEIGHT_SUM');
    }
    return weights.map(() => 0);
  }

  const rawShares = weights.map((w) => (total * w) / weightSum);
  const floors = rawShares.map((s) => Math.floor(s));
  let remainder = total - floors.reduce((a, b) => a + b, 0);

  // Hand the leftover cents to the largest fractional parts, biggest first.
  const order = rawShares
    .map((share, index) => ({ index, frac: share - Math.floor(share) }))
    .sort((a, b) => b.frac - a.frac || a.index - b.index);

  const result = [...floors];
  for (let i = 0; i < order.length && remainder > 0; i += 1, remainder -= 1) {
    result[order[i].index] += 1;
  }
  return result;
}''',
        'shared/src/money.js — largest-remainder allocation.')

    story += H3('The business problem')

    story += P(
        'A fuel supplier invoices US$48,391.55 for a month. That amount must be '
        'shared across 400 individual flights in proportion to the fuel each '
        'one burned, so that each flight carries a defensible cost.')

    story += CODE(
        '''// Naive: divide, then round each one.
4839155 / 400 = 12097.8875 cents
// Rounded independently: 12098 cents each
// 12098 x 400 = 4839200 cents  — 45 cents MORE than the invoice.

const allocate = allocate(4839155, weights);
sum(...allocate) === 4839155;   // true, always''')

    story += P(
        'Forty-five cents is not a large amount. But the same logic applies to '
        'every allocation in the system, across every month, across every '
        'aircraft and route. Errors of this size are individually tolerable and '
        'collectively fatal to reconciliation: a supplier invoice that can '
        'never be tied to the sum of its component entries is an invoice the '
        'airline cannot close.')

    story += H3('The method, step by step')

    story += NUMLIST([
        '**Work out each share exactly**, as a fraction. Do not round yet.',
        '**Take the whole part of each share** — round every one *down*. The '
        'sum is now guaranteed to be less than or equal to the total.',
        '**Count the leftover cents.** This is the difference between the '
        'floored sum and the original total. It cannot be more than one per '
        'share.',
        '**Rank the shares by how much they lost** in the previous step — the '
        'largest fractional part lost the most.',
        '**Hand out the leftover cents**, one each, largest-loss first.',
        '**Break ties by position**, so the same input always produces the same '
        'output. This matters for audit reproducibility.',
    ])

    story += CALLOUT(
        'good', 'Why determinism is a requirement, not a nicety',
        'Two engineers running the same allocation on the same data must get '
        'the same answer, or the audit trail will show a figure that changed '
        'with no underlying event. That is why the tie-break is explicit: '
        '`.sort((a, b) => b.frac - a.frac || a.index - b.index)`.')

    story += H2('Percentages as integers')

    story += P(
        'A percentage such as 17.5% cannot be stored as a fraction without '
        'introducing the original problem. AMS stores rates as parts per '
        'million.')

    story += CODE(
        '''// 17.5% stored as 175_000 parts per million
// 0.175%  stored as  17_500 parts per million
const ratePpm = 175_000;
applyPpm(1_000_00, ratePpm);   // 17500 cents = $175.00 exactly

export const COMPLIANCE_WARNING_THRESHOLD_PPM = 50_000; // 5% of remaining life
const bufferPpm = ctx.expectedBurnVariancePpm ?? 30_000; // default +3%
const cents = fee * (1_000_000 + VAT_PPM) / 1_000_000;''')

    story += P(
        'Parts per million give six decimal places of precision while staying '
        'a whole number. They appear throughout AMS: load factors as ppm, '
        'margins as ppm, compliance thresholds as ppm. When you see a field '
        'name ending `_Ppm`, it is a rate stored as an integer.')

    story += RULEHR()

    # ================= PART IV =================
    story += H1('Part IV — Measuring an airline')

    story += LEAD(
        'The airline industry expresses almost every commercial decision in a '
        'handful of ratios. This part explains them and shows how AMS computes '
        'them exactly.')

    story += H2('The industry ratios, explained')

    story += CODE(
        '''/**
 * AMS — Traffic and unit-economics metrics.
 *
 * The airline industry's entire commercial vocabulary reduces to a
 * handful of ratios. This module computes them exactly, in integer
 * cents per unit, so that two carriers' CASK figures are actually
 * comparable — which they are not, in practice, unless the numerator
 * is built from the same cost taxonomy (see domain.js COST_CATEGORIES).
 *
 * Key definitions, per IATA:
 *   ASK  Available Seat Kilometres — seats offered x distance flown.
 *        The supply side. Unaffected by whether anyone buys a ticket.
 *   RPK  Revenue Passenger Kilometres — paying passengers x distance.
 *        The demand side, and the only passenger-capacity measure that
 *        also carries revenue.
 *   PLF  Passenger Load Factor = RPK / ASK.
 *
 *   CASK  Cost per Available Seat Kilometre = operating cost / ASK
 *   RASK  Revenue per Available Seat Kilometre = revenue / ASK
 *
 *   CASM / RASM are the same ratios using statute miles (ASM). They are
 *   provided for US-filed comparability. 1 statute mile = 1.609344 km.
 *
 * Break-even load factor is the CASK/RASK ratio: the load factor below
 * which the flight does not cover its own variable and allocated cost.
 * The whole of schedule planning is an exercise in raising load factor
 * or lowering CASK on routes where their ratio is uncomfortable.
 *
 * @module metrics
 */''',
        'shared/src/metrics.js — the module header. Read this twice; it is the '
        'clearest statement in the codebase of what the system measures and '
        'why.')

    story += H2('Asking for capacity: ASK and RPK')

    story += CODE(
        '''export function ask(seatsOffered, distanceKm) {
  assertNonNegativeInt(seatsOffered, 'seatsOffered');
  assertNonNegativeInt(distanceKm, 'distanceKm');
  return seatsOffered * distanceKm;
}

export function rpk(passengers, distanceKm) {
  assertNonNegativeInt(passengers, 'passengers');
  assertNonNegativeInt(distanceKm, 'distanceKm');
  return passengers * distanceKm;
}''',
        'shared/src/metrics.js')

    story += P(
        'A concrete example. A 189-seat aircraft flies 4,000 km. It offers '
        '756,000 seat-kilometres of capacity regardless of whether anyone buys '
        'a ticket. If it carries 151 paying passengers, those passengers '
        'consume 604,000 revenue passenger-kilometres. The load factor is the '
        'second divided by the first: 79.9%.')

    story += CODE(
        '''export function loadFactorPpm(seatsOffered, passengers, distanceKm) {
  const a = ask(seatsOffered, distanceKm);
  const r = rpk(passengers, distanceKm);
  if (a === 0) return 0;
  return Math.floor((r / a) * 1_000_000 + 0.5);
}''',
        'shared/src/metrics.js — 799_000 ppm is 79.9%.')

    story += CALLOUT(
        'note', 'Why the result is not 0.799',
        'Because `0.799` is a fraction that cannot be represented exactly, and '
        'because the whole problem of Part III returns. Storing the load factor '
        'as 799000 — an integer number of parts per million — means it can be '
        'stored in a database, summed across flights, and compared exactly, '
        'with no drift.')

    story += H2('Cost and revenue per unit: CASK and RASK')

    story += CODE(
        '''export function caskMicrocents(operatingCostCents, asks) {
  if (!Number.isSafeInteger(operatingCostCents)) throw new MoneyError('cost must be integer cents', 'METRIC_BAD_COST');
  assertNonNegativeInt(asks, 'asks');
  if (asks === 0) return 0;
  // cost cents * 1e4 -> microcents, then per ASK
  return Math.floor((operatingCostCents * 1_000_000) / asks + 0.5);
}''',
        'shared/src/metrics.js')

    story += P(
        'CASK is the industry\'s most-quoted efficiency number: the cost of '
        'providing one seat-kilometre of empty capacity. Lower is better. RASK '
        'is the revenue from that same seat-kilometre, and the gap between '
        'them is the margin.')

    story += CODE(
        '''// Microcents, not cents
const cask = caskMicrocents(2_100_000, 756_000);   // 2777 microcents
// = 2.777 US cents per seat-km, the industry norm for a narrowbody

export const KM_PER_STATUTE_MILE = 1_609_344; // scaled by 1e6 to stay integer''')

    story += P(
        'The unit is microcents — cents multiplied by ten thousand — for a '
        'concrete reason stated in the code comment:')

    story += CODE(
        '''/**
 * Returned in microcents (cents x 10,000) rather than cents because a
 * long-haul flight spreads cost over hundreds of millions of ASK; a
 * plain cents figure would round to zero and destroy the signal.
 * Microcents are still an exact integer.
 */''')

    story += CALLOUT(
        'warn', 'The general lesson: choose a unit that cannot round to zero',
        'If you divide a large cost by a very large distance in cents, the '
        'answer may fall below one cent and become 0 — a number that looks '
        'like "free" and is meaningless. Scaling the unit preserves the signal '
        'while keeping the value a whole number. AMS applies this in several '
        'places: microcents for CASK, parts per million for ratios, '
        'milli-units for hours and weights.')

    story += H2('Why you must never average an average')

    story += P(
        'This is the most important modelling rule in the module, and the code '
        'comment states it plainly.')

    story += CODE(
        '''/**
 * Roll flights up into a route, fleet-type or period aggregate.
 * Aggregation of ratios is deliberately NOT the average of the parts —
 * it is always recomputed from the summed numerators and denominators.
 * Averaging per-flight load factors is a classic modelling error: it
 * weights a short hop equally with a long haul.
 *
 * @param {Array<FlightInput>} flights
 */''',
        'shared/src/metrics.js')

    story += P('Concretely. Consider a two-flight period:')

    story += TABLE(
        ['Flight', 'Distance', 'Passengers', 'Seats', 'ASK', 'RPK', 'Load factor'],
        [
            ['Short hop', '800 km', '170', '189', '151,200', '136,000', '90.0%'],
            ['Long haul', '9,000 km', '150', '189', '1,701,000', '1,350,000', '79.4%'],
            ['**Average of the two**', '', '', '', '', '', '**84.7%**'],
            ['**Correct total**', '9,800 km', '320', '378', '1,852,200', '1,486,000', '**80.2%**'],
        ],
        widths=[22, 13, 14, 10, 14, 15, 12])

    story += P(
        'The average of the two load factors is 84.7%. The true figure is '
        '80.2%. The short hop carried 90% of its seats, but it represents only '
        '8% of the distance, so its good performance barely counts. Averaging '
        'gives it equal weight with a flight twelve times longer.')

    story += CODE(
        '''const totals = flights.reduce(
  /** @returns {RollUpTotals} */
  (acc, f) => {
    const m = flightMetrics(f);
    acc.asks += m.asks;
    acc.rpks += m.rpks;
    acc.revenueCents += m.revenueCents;
    acc.operatingCostCents += m.operatingCostCents;
    // ...
    return acc;
  },
  /** @type {RollUpTotals} */ ({
    asks: 0, rpks: 0, revenueCents: 0, operatingCostCents: 0,
    seatsOffered: 0, passengers: 0, blockHoursMilli: 0, distanceKm: 0, sectors: 0,
  }),
);

return {
  ...totals,
  loadFactorPpm: totals.asks === 0 ? 0 : Math.floor((totals.rpks / totals.asks) * 1_000_000 + 0.5),
  caskMicrocents: caskMicrocents(totals.operatingCostCents, totals.asks),
};''',
        'shared/src/metrics.js — sum the ingredients, divide once at the end.')

    story += CALLOUT(
        'bug', 'A subtle JavaScript trap this code avoids',
        'Notice that the accumulator is written as `acc.asks += m.asks` and '
        'then `return acc` — the accumulator is *mutated* rather than replaced. '
        'The codebase\'s comment on this says that `Array.reduce` otherwise '
        'infers the accumulator type from the element type, which silently '
        'widens it and loses every aggregate field. Both styles work at '
        'runtime; the explicit type annotation is what makes the check gate '
        'reliable.')

    story += H2('Break-even load factor')

    story += CODE(
        '''export function breakEvenLoadFactorPpm(operatingCostCents, revenueCents) {
  if (!Number.isSafeInteger(operatingCostCents) || !Number.isSafeInteger(revenueCents)) {
    throw new MoneyError('cost and revenue must be integer cents', 'METRIC_BAD_INPUT');
  }
  if (revenueCents === 0) return Number.MAX_SAFE_INTEGER; // never breaks even
  return Math.floor((operatingCostCents / revenueCents) * 1_000_000 + 0.5);
}''',
        'shared/src/metrics.js')

    story += P(
        'Break-even load factor answers one question: at what occupancy does '
        'the flight exactly cover its cost? It is the ratio of cost to revenue, '
        'because the distance cancels out.')

    story += CODE(
        '''//   breakEvenLF = CASK / RASK = cost/ASK / (revenue/ASK) = cost/revenue''')

    story += P(
        'The line `if (revenueCents === 0) return Number.MAX_SAFE_INTEGER` is a '
        'good example of defensive design. A flight that carried nobody has '
        'no revenue, so the ratio is undefined. Rather than divide by zero and '
        'produce `Infinity` or `NaN` — both of which would silently poison '
        'every later calculation — the function returns the largest possible '
        'integer, which correctly reads as "this flight never breaks even".')

    story += CALLOUT(
        'note', 'Why Number.MAX_SAFE_INTEGER and not Infinity',
        '`Infinity` is a valid JavaScript number but an invalid database '
        'value and an invalid JSON value. Returning a real integer means the '
        'figure can be stored, compared and rendered without special cases '
        'downstream.')

    story += CODE(
        '''export function utilisationMilli(blockHours, aircraftDays) {
  if (aircraftDays <= 0) return 0;
  return Math.floor((blockHours / aircraftDays) * 1000 + 0.5);
}''',
        'shared/src/metrics.js — utilisation in hours per aircraft per day, '
        'stored with three decimal places of precision.')

    story += P(
        'The comment calls this "the single strongest driver of unit cost in '
        'the industry". An aircraft on the ground earns nothing and still '
        'burns money. Utilisation is therefore the operational metric with the '
        'largest effect on CASK.')

    story += RULEHR()