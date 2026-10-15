/**
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
 */

/** @typedef {number} Cents Integer minor units. Never a float result. */

export class MoneyError extends Error {
  /** @param {string} message @param {string} [code] */
  constructor(message, code = 'MONEY_ERROR') {
    super(message);
    this.name = 'MoneyError';
    this.code = code;
  }
}

/** @param {unknown} v */
function assertSafeInteger(v, what = 'amount') {
  if (typeof v !== 'number' || !Number.isSafeInteger(v)) {
    throw new MoneyError(
      `${what} must be a safe integer number of cents; received ${typeof v} ${String(v)}. ` +
        'Floating-point money is forbidden — parse from a string with cents().',
      'MONEY_NOT_SAFE_INTEGER',
    );
  }
}

/**
 * Parse a human-entered monetary amount into integer cents without
 * ever routing the value through a binary float.
 *
 * Accepts "1234.56", "1,234.56", "-78.90", "1 234.56", 12.5 (safe only
 * because we go via toFixed(2) stringification, not arithmetic).
 *
 * @param {string | number} input
 * @returns {Cents}
 */
export function cents(input) {
  const raw = typeof input === 'number' ? input.toFixed(2) : String(input);
  const cleaned = raw.replace(/[\s,_]/g, '');
  const match = /^(-?)(\d*)(?:\.(\d{1,2}))?$/.exec(cleaned);
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
}

/**
 * Render integer cents back to a display string.
 * @param {Cents} value
 * @param {string} [currency]
 * @returns {string}
 */
export function format(value, currency = 'USD') {
  assertSafeInteger(value);
  const negative = value < 0;
  const abs = Math.abs(value);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const symbol = { USD: '$', EUR: '€', GBP: '£', ZWG: 'ZWG ' }[currency] ?? `${currency} `;
  return `${negative ? '-' : ''}${symbol}${grouped}.${String(frac).padStart(2, '0')}`;
}

/** @param {...Cents} values @returns {Cents} */
export function sum(...values) {
  return values.reduce((acc, v) => {
    assertSafeInteger(v);
    return acc + v;
  }, 0);
}

/** @param {Cents} a @param {Cents} b @returns {Cents} */
export function add(a, b) { assertSafeInteger(a); assertSafeInteger(b); return a + b; }

/** @param {Cents} a @param {Cents} b @returns {Cents} */
export function subtract(a, b) { assertSafeInteger(a); assertSafeInteger(b); return a - b; }

/** @param {Cents} a @returns {Cents} */
export function negate(a) { assertSafeInteger(a); return -a; }

/**
 * Multiply money by a WHOLE number. Integer factors only — there is no
 * way to express "multiply by 1.5 cents" and that is deliberate.
 * @param {Cents} value @param {number} factor
 * @returns {Cents}
 */
export function multiplyWhole(value, factor) {
  assertSafeInteger(value);
  if (!Number.isInteger(factor)) {
    throw new MoneyError(`Multiplier must be a whole number; received ${factor}`, 'MONEY_NON_INTEGER_FACTOR');
  }
  return value * factor;
}

/**
 * Apply a rate expressed in parts-per-million, rounded half-up away
 * from zero. Used for FX conversion, fuel-price escalators, indexation
 * and percentage-of-revenue allocations where the rate is stored as
 * an integer (e.g. 0.175% = 17_500 ppm).
 *
 * @param {Cents} value
 * @param {number} ratePpm integer parts per million
 * @returns {Cents}
 */
export function applyPpm(value, ratePpm) {
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
}

/**
 * Distribute `total` across `weights` so that the parts sum to EXACTLY
 * the total, using the largest-remainder method.
 *
 * This is the single most important function in the costing engine.
 * When you split a monthly fuel cost across 400 flights you cannot
 * round each flight's share independently: 400 × 1 cent of rounding
 * drift becomes 4 dollars that cannot be reconciled to the supplier
 * invoice. Largest-remainder guarantees zero leakage.
 *
 * @param {Cents} total must be >= 0
 * @param {number[]} weights non-negative
 * @returns {Cents[]} same length as weights, sums to total
 */
export function allocate(total, weights) {
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
  for (let i = 0; remainder > 0 && i < order.length; i += 1, remainder -= 1) {
    result[order[i].index] += 1;
  }
  // If ties exhausted the order list (only possible when every fraction
  // is zero and total < weights.length), distribute cyclically.
  for (let i = 0; remainder > 0; i += 1, remainder -= 1) {
    result[i % result.length] += 1;
  }
  return result;
}

/**
 * Allocate by percentage shares that may themselves be fractional
 * (e.g. a 33.3 / 33.3 / 33.4 split). Weights may be floats here because
 * they are ratios, not money — but the OUTPUT is still exact cents.
 * @param {Cents} total @param {number[]} shares
 * @returns {Cents[]}
 */
export function allocateByShare(total, shares) {
  return allocate(total, shares);
}

/**
 * Assert that a set of amounts reconciles to an expected total.
 * Used by the three-way match and by the costing engine's own
 * self-checks. Throwing here is intentional: a silent mismatch in an
 * airline ledger becomes a million-dollar misstatement.
 * @param {number[]} parts @param {Cents} expected @param {string} context
 */
export function assertReconciles(parts, expected, context = 'reconciliation') {
  const actual = sum(...parts);
  if (actual !== expected) {
    throw new MoneyError(
      `${context} does not balance: parts total ${format(actual)}, expected ${format(expected)}`,
      'MONEY_DOES_NOT_RECONCILE',
    );
  }
  return true;
}

/**
 * Accrual split: apportion an amount across periods by weight, used for
 * lease incentive spread across the lease term.
 * @param {Cents} total @param {number[]} periodWeights
 */
export function spreadAcrossPeriods(total, periodWeights) {
  return allocate(total, periodWeights);
}
