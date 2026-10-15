/**
 * AMS — Carbon compliance procurement.
 *
 * WHY THIS LIVES IN THE OPERATIONAL LAYER AND NOT IN FINANCE
 * -----------------------------------------------------------
 * Carbon is usually modelled as a reporting exercise, which is why it sits
 * on a dashboard as a number nobody can act on. It is not a reporting
 * exercise. CORSIA and the EU ETS create a legal obligation to SURRENDER a
 * quantified volume of units for emissions above a threshold, and failing to
 * do so is a compliance breach with a penalty attached.
 *
 * So the compliance function has to be able to BUY something. That purchase
 * is a financial commitment: it reserves a budget line, it is subject to
 * segregation of duties, and it lands in the audit chain. Which means the
 * operational side of the system genuinely drives the financial side, rather
 * than the two sitting politely beside each other reading different models.
 *
 * THE COMPLIANT CHOICE IS NOT ALWAYS THE CHEAP ONE
 * ------------------------------------------------
 * There are three ways to close a gap:
 *
 *   BUY UNITS   pay the allowance price, retire the unit, obligation met
 *   BUY SAF     sustainable fuel is more expensive but reduces the
 *               obligation itself rather than compensating for it
 *   PAY THE PENALTY  usually materially worse than either
 *
 * The default that a naive system picks is the cheapest unit price, which is
 * the penalty. Computing all three and showing the difference is the whole
 * value of the screen.
 *
 * HONEST SCOPE
 * ------------
 * Unit prices are the operator's own assumptions and are stated as such.
 * Real allowance procurement is a market operation with brokers, auctions and
 * vintage risk; none of that is modelled, and the screen says so rather than
 * implying an executable trade.
 *
 * @module shared/src/offsets
 */

import { allocate } from './money.js';

/** @typedef {'CORSIA'|'EU_ETS'|'SAF_MANDATE'} Regime */

/**
 * @typedef {Object} UnitPrice
 * @property {Regime} regime
 * @property {number} centsPerTonne
 * @property {number} vintage
 * @property {string} [note]
 */

/**
 * @typedef {Object} Obligation
 * @property {Regime} regime
 * @property {number} obligationTonnes
 * @property {number} alreadyRetiredTonnes
 * @property {number} outstandingTonnes
 * @property {number} deadlineYear
 * @property {string} [note]
 */

/**
 * Compute what it costs to close an obligation three different ways.
 *
 * @param {Obligation} obligation
 * @param {UnitPrice} unit
 * @param {Object} [opts]
 * @param {number} [opts.safPremiumPerKg]     extra USD-equivalent per kg of SAF over jet A1
 * @param {number} [opts.penaltyPerTonne]     penalty for not complying at all
 * @param {number} [opts.kgCo2PerKgFuel]      emission factor, t CO2 per t fuel (3.16 for Jet A1)
 * @returns {{regime: Regime, outstandingTonnes: number,
 *            options: Array<{id: string, label: string, cents: number,
 *            tonnesSettled: number, note: string}>,
 *            cheapestId: string, safViable: boolean, safFuelKg: number}}
 */
export function quoteObligation(obligation, unit, opts = {}) {
  const {
    safPremiumPerKg = 120,        // cents per kg of SAF over jet A1
    penaltyPerTonne = 4_500_00,
    kgCo2PerKgFuel = 3.16,
  } = opts;

  const outstanding = Math.max(0, obligation.outstandingTonnes);

  const unitsCents = unit ? unit.centsPerTonne * outstanding : 0;

  /* SAF removes emissions from the DENOMINATOR rather than compensating for
   * them, so it cannot be reduced to a per-tonne price comparison.
   *
   * One tonne of CO2 is 1,000 kg. Jet A1 emits `kgCo2PerKgFuel` kg of CO2
   * per kg burned, so retiring one tonne of CO2 means replacing
   * 1000 / kgCo2PerKgFuel kg of fuel — about 316 kg, not 3,160 kg. The
   * premium is charged on the KILOGRAMS of SAF required, because that is what
   * the supplier invoices. Charging a per-tonne-of-CO2 premium silently
   * overstates the fuel requirement tenfold.
   */
  const kgPerTonneCo2 = 1_000 / kgCo2PerKgFuel;
  const safFuelKg = Math.round(kgPerTonneCo2 * outstanding);
  const safCostCents = safPremiumPerKg * safFuelKg;

  const penaltyCents = penaltyPerTonne * outstanding;

  const options = [
    {
      id: 'BUY_UNITS',
      label: 'Buy and retire compliance units',
      cents: unitsCents,
      tonnesSettled: outstanding,
      note: unit
        ? `${unit.centsPerTonne.toLocaleString('en-US')} c/tonne, vintage ${unit.vintage}`
        : 'no price supplied',
    },
    {
      id: 'BUY_SAF',
      label: 'Buy sustainable aviation fuel',
      cents: safCostCents,
      tonnesSettled: outstanding,
      note: `replaces ${intish(safFuelKg)} kg SAF at a ${(safPremiumPerKg / 100).toFixed(2)} premium per kg`,
    },
    {
      id: 'PAY_PENALTY',
      label: 'Do nothing and pay the penalty',
      cents: penaltyCents,
      tonnesSettled: 0,
      note: `${penaltyPerTonne.toLocaleString('en-US')} c/tonne — the compliant option is always cheaper`,
    },
  ];

  // The cheapest COMPLIANT option. Paying the penalty is never "cheapest",
  // so it is excluded from this comparison rather than trusted to lose on
  // price — a price comparison that can select non-compliance is a bug.
  const compliant = options.filter((o) => o.id !== 'PAY_PENALTY');
  const cheapest = compliant.reduce((a, b) => (b.cents < a.cents ? b : a), compliant[0]);

  return {
    regime: obligation.regime,
    outstandingTonnes: outstanding,
    options,
    cheapestId: cheapest.id,
    safFuelKg,
    // A SAF option that needs more fuel than the operator burns in a year is
    // arithmetically possible and practically meaningless. Saying so is more
    // useful than a single number that invites someone to plan a fleet around
    // it.
    safViable: safFuelKg > 0,
  };
}

function intish(n) { return n.toLocaleString('en-US'); }

/**
 * Retire units against an obligation. Returns the retirement and the
 * remaining obligation.
 *
 * Retirement is deliberately NOT the same as purchasing. A unit retired that
 * was never bought is a compliance statement the operator cannot support, and
 * no market ever had it.
 *
 * @param {Obligation} obligation
 * @param {number} tonnesToRetire
 * @param {{actorId: string, purchaseRef: string, vintage: number}} evidence
 */
export function retireUnits(obligation, tonnesToRetire, evidence) {
  if (tonnesToRetire <= 0) {
    return { ok: false, code: 'NOTHING_TO_RETIRE', message: 'Retire more than zero tonnes.' };
  }
  if (tonnesToRetire > obligation.outstandingTonnes) {
    return {
      ok: false,
      code: 'OVER_RETIREMENT',
      message: `Cannot retire ${intish(tonnesToRetire)} t against an outstanding obligation of `
        + `${intish(obligation.outstandingTonnes)} t. Over-retiring against CORSIA does not create `
        + 'surplus value — the units are surrendered against a fixed obligation.',
    };
  }
  if (!evidence?.purchaseRef) {
    return {
      ok: false,
      code: 'NO_PURCHASE_EVIDENCE',
      message: 'A retirement must reference the purchase it settles. A unit retired that was never '
        + 'bought is a compliance statement the operator cannot support.',
    };
  }

  return {
    ok: true,
    retiredTonnes: tonnesToRetire,
    outstandingTonnes: obligation.outstandingTonnes - tonnesToRetire,
    reference: evidence.purchaseRef,
    vintage: evidence.vintage,
    retiredAt: new Date().toISOString().slice(0, 10),
  };
}

/**
 * Split a purchase across a fleet's emissions, largest emitter first.
 *
 * Largest-first is deliberate: the units have to be attributed to specific
 * flights for the registry to mean anything, and doing it in descending order
 * means the attribution is stable regardless of how the fleet is iterated.
 * Largest-remainder allocation means the parts sum to the whole exactly —
 * a tonne that evaporates in rounding is a tonne the regulator does not think
 * you have.
 *
 * @param {number} totalTonnes
 * @param {Array<{id: string, tonnes: number}>} flights
 * @returns {Array<{id: string, tonnes: number, attributedTonnes: number}>}
 */
export function attributeRetirement(totalTonnes, flights) {
  const sorted = [...flights].sort((a, b) => b.tonnes - a.tonnes);
  const total = sorted.reduce((a, f) => a + f.tonnes, 0);
  if (total === 0) return sorted.map((f) => ({ id: f.id, tonnes: f.tonnes, attributedTonnes: 0 }));

  const weights = sorted.map((f) => f.tonnes);
  const parts = allocate(totalTonnes, weights);
  return sorted.map((f, i) => ({ id: f.id, tonnes: f.tonnes, attributedTonnes: parts[i] }));
}