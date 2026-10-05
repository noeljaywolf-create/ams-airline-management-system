# AMS — Airline Management System

Multi-tenant airline **finance, fleet and procurement** platform.
JavaScript (ESM) · Express · Knex · PostgreSQL 16 · React

> **Status:** Wave 1 complete. The costing engine, cost authority,
> audit chain, airworthiness and carbon logic are built and tested.
> **118 tests passing · 0 type errors.** See `docs/AMS-Specification.pdf`.

---

## Why this exists

Airlines cannot answer three questions without weeks of manual work:

| Question | Today's answer |
|---|---|
| What did **that flight** actually cost? | Invoices arrive at monthly grain, months after the aircraft moved on |
| Can we afford **this** purchase? | Someone checks a spreadsheet, then someone else approves, then the money goes |
| Will **this part** be legal next month? | A spreadsheet, and hope |

AMS inverts all three: cost is attributed at the moment it happens,
authorisation is enforced inside the transaction, and airworthiness is
computed rather than remembered.

---

## The three hard problems

### 1. Cost is not knowable in advance

Invoices for a January flight arrive in March, aggregated across hundreds
of rotations. The aircraft that burned the fuel has flown 300 more
sectors. Finance reconciles; operations argues; nobody owns the number.

```js
import { flightPnl, aggregatePnl, routeVerdict } from './shared/src/costing.js';

const pnl = flightPnl({
  costInput: {
    fuelKg: 3200, fuelPriceCentsPerKg: 95,
    flightCrewCents: 185_000, cabinCrewCents: 94_000,
    airportChargesCents: 145_000, navigationCents: 68_000,
    cateringCents: 98_000, handlingCents: 42_000,
    blockHours: 4.5, seatsOffered: 189, passengers: 151, distanceKm: 4000,
  },
  fleetFixedLines: [{ cost: 74_400, category: 'lease_aircraft' }],
  revenueCents: 2_410_000,
});

pnl.caskMicrocents;          // unit cost, exact integer
pnl.marginalCostOfExtraSeatCents;  // what one more passenger really costs
pnl.breakEvenLoadFactorPpm;  // load factor needed to cover itself

routeVerdict(aggregatePnl([/* ...flights */]));
// → { verdict: 'PROFITABLE', levers: { loadFactorGapPpm, caskHeadroomMicrocents } }
```

**The distinction that matters:** an extra passenger costs fuel and a
tray. They do not cost another landing fee or another cabin crew. AMS
reports both the *marginal* and *full* cost, because pricing to the wrong
one either loses the traffic or loses the money.

### 2. Double-spending is not fraud, and that is why it happens

A hundred individually-reasonable approvals, each against a budget line
that looked like it had room, exceed the board's plan by a quarter.
Nobody cheated. The aggregate was unauthorised.

The cause is a check-then-write race. Check the balance, write the
commitment — and in between, another request does the same. Both see
US$10,000 available. Both approve.

```js
// backend/src/modules/finance/cost-authority.js
const line = await db('budget_lines')
  .where({ id: lineId, tenant_id: tenantId })
  .forUpdate()          // ← second transaction BLOCKS here
  .first();
// ... re-reads the balance the first transaction left behind
```

`FOR UPDATE` does not *defend against* the race. It makes it
**unrepresentable**. The `available_cents` column is
`GENERATED ALWAYS AS (...) STORED` in the database, so it can never drift
from its components, and a `CHECK (available_cents >= 0)` constraint
makes a negative balance impossible at the storage layer.

### 3. Airworthiness is a legal matter, not a planning preference

A life-limited part has a hard limit in cycles, hours **or** calendar
months. A part with 50% of its cycle life left but 4% of its calendar
life is nearly scrap — and a planner who only looks at cycles flies it
into the ground.

```js
llpStatus({ partNumber: 'P/N-4471', cyclesTotalLimit: 10000, cyclesSinceNew: 5000,
            monthsTotalLimit: 120, monthsSinceNew: 115 });
// → { controllingCounter: 'CALENDAR', controllingRemaining: 5, mustRemove: false }
```

AMS also keeps **ADs and SBs on separate compliance tracks**. A fleet
that "applied the Service Bulletin" is not necessarily compliant with
the Airworthiness Directive. Merging them is a common and expensive
error.

---

## Money: why integers, everywhere

```js
0.1 + 0.2 !== 0.3            // IEEE-754 binary representation
```

In a ledger that error compounds across a million transactions and the
trial balance stops footing. AMS stores every amount as **integer minor
units** and confines all arithmetic to `shared/src/money.js`:

```js
cents('1234.56')            // 123456 — parsed without touching a float
allocate(87_431_66, weights) // splits across 400 flights, parts sum EXACTLY
assertReconciles(parts, expected)  // throws loudly rather than leaking
```

`allocate()` uses the largest-remainder method specifically so that
splitting a real fuel invoice across 400 rotations loses **nothing**. Naive
per-share rounding leaks 400 cents.

---

## Project layout

```
ams/
├── shared/src/
│   ├── domain.js         all states, departments, cost categories
│   ├── money.js          integer-cent arithmetic — the ONLY place money maths
│   ├── metrics.js        ASK, RPK, CASK, RASK, load factor, break-even
│   ├── costing.js        THE SPINE — flight cost, allocation, route verdict
│   ├── airworthiness.js  LLP life, AD/SB compliance, MEL deferrals
│   ├── fuel.js           burn variance, regulatory reserves, tankering
│   └── carbon.js         CORSIA + EU ETS, with double-counting prevented
├── backend/
│   ├── src/audit/chain.js           hash-chained tamper-evident audit
│   ├── src/modules/finance/         cost authority (the control core)
│   └── migrations/                  PostgreSQL, RLS, generated columns
└── tests/               118 tests, no services required
```

## Commands

```bash
npm install
npm test          # 118 tests, ~5s, no database needed
npm run typecheck # checkJs gate — ADR-001, emits nothing, fails on type errors
docker compose up # full stack
```

## The JavaScript decision (ADR-001)

No TypeScript build. Correctness is carried by Zod validation at every
request boundary, JSDoc annotations, and a `checkJs` **no-emit** gate in
CI. The gate found **47 genuine defects** on first run against this
codebase — including two source bugs (`cyclesPerHour` undefined; an
unreachable branch in `routeVerdict`) that the 118 unit tests missed.

That is the argument for keeping it. Revisit if the team exceeds four
engineers or the codebase passes 250,000 lines.

## Departments

16 registered. **5 functional in wave 1:** Finance & Treasury,
Procurement & Supply, Technical/Engineering, Executive, IT/Admin.
**11 explicitly Phase 2:** Flight Ops, Crew Scheduling, Training &
Standards, Safety & Risk, QA, Commercial, Ticketing, Customer Service,
Cargo, Ground Ops, HR.

Aviation regulations mandate named accountable managers, so the
department structure is a regulatory artefact — not a UI preference.
