"""
Front matter, Part I (language foundations) and Part II (numbers and money).
"""

from framework import (BUL, CALLOUT, CODE, H1, H2, H3, LEAD, NUMLIST, P,
                       RULEHR, SPACER, TABLE, _esc, _rich)

TOC = [
    ('Part I — How to read this guide', [
        'Who this is for, and how to use it',
        'What AMS actually does',
        'Why this system is written in JavaScript',
        'Reading the code samples',
    ]),
    ('Part II — The language, from the beginning', [
        'What a variable actually is',
        'Numbers are the one thing to fear',
        'Text, and how code reads it',
        'Decisions: if, and the shape of a condition',
        'Loops, and when not to use one',
        'Functions: naming a piece of work',
        'Objects: labelled collections',
        'Arrays: ordered collections',
        'The special value undefined, null, and NaN',
        'Modules: how files talk to each other',
    ]),
    ('Part III — Money, the discipline that defines this codebase', [
        'Why nobody uses decimals for money in code',
        'Cents: the integer unit AMS chose',
        'Parsing a human amount safely',
        'Rounding: the rules AMS applies',
        'Splitting money without losing a cent',
        'Percentages as integers',
    ]),
    ('Part IV — Measuring an airline', [
        'The industry ratios, explained',
        'Asking for capacity: ASK and RPK',
        'Cost and revenue per unit: CASK and RASK',
        'Why you must never average an average',
        'Break-even load factor',
    ]),
    ('Part V — The costing engine', [
        'Two kinds of cost',
        'Building the cost of one sector',
        'Allocating fixed cost to flights',
        'Full profit and loss for a flight',
        'Marginal cost: what one more passenger costs',
        'Aggregating many flights',
        'The route verdict',
    ]),
    ('Part VI — Fuel, the largest single cost', [
        'Uplift is not burn',
        'Reconciling plan against actual',
        'Tankering: carrying fuel is a decision',
        'Statistical detection of a fuel problem',
    ]),
    ('Part VII — Airworthiness and legal safety', [
        'Life-limited parts and three counters',
        'Finding the limit that binds first',
        'Directives and bulletins are not the same',
        'Deferral deadlines and the off-by-one',
        'Why a deferral cannot cancel a directive',
        'The dispatch gate',
    ]),
    ('Part VIII — Routing and fuel planning (the algorithms)', [
        'The problem, stated precisely',
        'The naive approaches and why they fail',
        'Keeping only useful possibilities',
        'The dominance rule and why it is sound',
        'A second solver to check the first',
        'Brute force as an oracle',
        'Optimal uplift planning',
        'Proving the uplift policy is optimal',
        'The five real bugs these tests caught',
    ]),
    ('Part IX — The server side: money in a database', [
        'What a server is',
        'Asynchronous JavaScript and promises',
        'Database queries as chainable objects',
        'The race that overspends an airline',
        'Row locks and transactions',
        'Idempotency: making retries safe',
        'All-or-nothing across a flight leg',
    ]),
    ('Part X — The audit trail', [
        'Why an audit trail must be unchangeable',
        'Hashing: a fingerprint for data',
        'Chaining entries together',
        'Canonical form: making hashing reliable',
        'Verifying a chain',
    ]),
    ('Part XI — Types without TypeScript', [
        'The decision to write plain JavaScript',
        'What JSDoc does and does not do',
        'The type-check gate',
        'Where the guarantee really comes from',
    ]),
    ('Part XII — Testing as the real safety net', [
        'What a test suite is for',
        'Structural tests versus expected values',
        'Testing against three implementations',
        'Property tests: invariants that must hold',
        'Making random tests reproducible',
        'Regression tests for real defects',
    ]),
    ('Part XIII — Defects found, and what they teach', [
        'Defect 1: an object built from nothing',
        'Defect 2: an answer multiplied by zero',
        'Defect 3: the test that shared the bug',
        'Defect 4: the wrong node in the solver',
        'Defect 5: refusing the plans it existed for',
        'Defect 6: an infinite loop in a legal case',
        'What the pattern tells you',
    ]),
    ('Part XIV — What comes next', [
        'The server layer, when it is built',
        'Identity, access and multi-tenancy',
        'Spreadsheets, PDF and Word generation',
        'What still needs a qualified human',
        'Glossary',
    ]),
]


def build(story):
    # ---------------- COVER ----------------
    story += SPACER(150)
    from framework import S, ParagraphStyle, ACCENT
    from reportlab.platypus import Paragraph, Spacer
    from reportlab.lib import colors

    def _st(**kw):
        return ParagraphStyle('inline', **kw)

    story.append(Paragraph(
        'AMS', _st(fontName='Helvetica-Bold', fontSize=62,
                   textColor=ACCENT, leading=66)))
    story.append(Spacer(1, 6))
    story.append(Paragraph(
        'JavaScript: The Language Behind the Platform',
        _st(fontName='Helvetica-Bold', fontSize=25,
            textColor=colors.HexColor('#23313d'), leading=31)))
    story.append(Spacer(1, 14))
    story.append(Paragraph(
        'A teaching guide for managers and new engineers, '
        'written entirely from the live AMS codebase.',
        _st(fontName='Helvetica', fontSize=12.4,
            textColor=colors.HexColor('#5a6472'), leading=18)))
    story.append(Spacer(1, 26))
    rule = TABLE([' '], [[' ']], widths=[3.2])
    story += rule
    story.append(Spacer(1, 20))
    for line in ['Airline Management System',
                 'Finance · Fleet · Procurement',
                 'JavaScript (ESM) · Express · Knex · PostgreSQL 16 · React']:
        story.append(Paragraph(
            line, _st(fontName='Helvetica', fontSize=10.4,
                      textColor=colors.HexColor('#5a6472'), leading=16)))
    story.append(Spacer(1, 120))
    story.append(Paragraph(
        'Every code sample in this document was copied from the '
        'running system. Nothing here is invented illustration.',
        _st(fontName='Helvetica-Oblique', fontSize=9.2,
            textColor=colors.HexColor('#7b8592'), leading=14)))

    # ---------------- HOW TO USE ----------------
    story += H1('How to use this guide')

    story += LEAD(
        'This document teaches JavaScript using the AMS airline platform as '
        'the worked example. Every concept is introduced in plain language, '
        'demonstrated in real AMS code, and then restated in terms of what it '
        'means for the business.')

    story += P(
        'It assumes you have never written a program. It does not assume you '
        'are technical. If you can read a sentence and follow an argument, you '
        'can read this.')

    story += H2('Three ways to read it')

    story += TABLE(
        ['If you are…', 'Start at', 'You will get'],
        [
            ['A manager, no coding background',
             'Part I, then Parts III and V, then Part XIII',
             'Enough to review AMS output critically and ask the right '
             'questions of your engineers'],
            ['A new engineer joining the team',
             'The whole document, in order',
             'A working grasp of the language and the codebase conventions'],
            ['A developer reviewing AMS code',
             'Parts XI, XII, XIII',
             'The reasoning behind the testing and typing decisions, and '
             'the defects to look for'],
        ],
        widths=[26, 32, 42])

    story += H2('What is in each part')

    story += TABLE(
        ['Part', 'Subject', 'Why it matters'],
        [
            ['I', 'Orientation',
             'What the system is for and why it is built this way'],
            ['II', 'The JavaScript language',
             'The fundamentals, using AMS code throughout'],
            ['III', 'Money',
             'The single most important discipline in this codebase'],
            ['IV', 'Airline metrics',
             'The ratios every commercial decision rests on'],
            ['V', 'The costing engine',
             'How AMS answers "what did that flight cost?"'],
            ['VI', 'Fuel',
             'The largest and least controllable cost'],
            ['VII', 'Airworthiness',
             'Where a software error can cost an operator its licence'],
            ['VIII', 'Algorithms',
             'Route planning and fuel optimisation, and how they were proven'],
            ['IX', 'The server and the database',
             'How AMS stops an airline overspending'],
            ['X', 'The audit trail',
             'How history is made unchangeable'],
            ['XI', 'Types without TypeScript',
             'How the team gets safety without a build step'],
            ['XII', 'Testing',
             'The actual safety net behind every number'],
            ['XIII', 'Defects',
             'Real bugs that shipped, and what each one teaches'],
            ['XIV', 'What comes next',
             'Planned work, and what still needs qualified people'],
        ],
        widths=[8, 30, 62])

    story += CALLOUT(
        'note', 'A note on what this document is not',
        'AMS makes calculations that support financial and regulatory '
        'decisions. This guide explains how the code works. It is not '
        'accounting advice, airworthiness advice, or regulatory advice, and '
        'nothing in it substitutes for a qualified aviation finance or '
        'compliance professional signing off on the system before it '
        'influences a real decision.')

    # ---------------- CONTENTS ----------------
    story += H1('Contents')
    from framework import ParagraphStyle
    part_st = ParagraphStyle(
        'tocpart', fontName='Helvetica-Bold', fontSize=10.6,
        textColor=colors.HexColor('#0b4f6c'), leading=15,
        spaceBefore=9, spaceAfter=2)
    sec_st = ParagraphStyle(
        'tocsec', fontName='Helvetica', fontSize=9.2,
        textColor=colors.HexColor('#3a4653'), leftIndent=15, leading=12.6)
    for part, sections in TOC:
        story.append(Paragraph(_rich(part), part_st))
        for sec in sections:
            story.append(Paragraph(_rich(sec), sec_st))

    # ================= PART I =================
    story += H1('Part I — How to read this guide')

    story += H2('What AMS actually does')

    story += P(
        'An airline knows roughly what it spent last year. What it usually '
        'cannot tell you is what a particular flight cost, why a route is '
        'losing money, or whether a purchase was actually approved.')

    story += P(
        'The reason is timing. A fuel invoice for January arrives in March, '
        'combined across hundreds of flights. By the time finance opens it, '
        'the aircraft that burned that fuel has flown several hundred more '
        'sectors. There is no honest way to attribute the cost to the flight '
        'that caused it, so nobody tries, and the number simply does not '
        'exist.')

    story += CODE(
        '''/**
 * AMS — Costing engine. THE SPINE OF THE PLATFORM.
 *
 * Every other module hangs off this one. Fuel, fleet, crew allocation,
 * route profitability, break-even decisions, executive reporting and
 * the budget all reconcile through the arithmetic in this file.
 *
 * The central idea: an airline cannot answer "what did this flight
 * cost?" by looking at invoices. Invoices arrive weeks later, at
 * monthly or quarterly grain, aggregated across hundreds of rotations.
 * By the time finance sees the Jet A invoice, the aircraft that burned
        * it has flown 300 more sectors.''',
        'shared/src/costing.js — the opening of the module. Note that the '
        'first thing any engineer reads is a statement of the problem, not '
        'a list of functions.')

    story += P(
        'AMS inverts this. Cost is attributed to a flight at the moment it '
        'happens, from primary records — the fuel uplift note, the crew duty '
        'report, the landing fee receipt. The accounting ledger then becomes '
        'a summary of facts that are already attributed, rather than a '
        'separate exercise in guessing.')

    story += LEAD(
        'This is worth pausing on, because it explains a great deal about how '
        'the code is written. When a fact is captured correctly at the moment '
        'it occurs, most later problems disappear. When it is not, they are '
        'almost impossible to fix retrospectively.')

    story += H2('Why this system is written in JavaScript')

    story += P(
        'The decision was deliberate and is recorded as ADR-001. The short '
        'version: AMS ships no build step. What you read in the repository is '
        'what runs.')

    story += CODE(
        '''{
  "compilerOptions": {
    "allowJs": true,
    "checkJs": true,
    "noEmit": true,
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": false,
    "skipLibCheck": true
  },
  "include": ["shared/src/**/*.js", "backend/src/**/*.js", "tests/**/*.js"],
  "exclude": ["node_modules"]
}''',
        'tsconfig.json — the whole type-safety configuration. There is no '
        '"outDir" and no compiler step, because nothing is compiled.')

    story += BUL([
        '**No build step.** No transpiler, no bundler, no generated files. A '
        'change is live when the file is saved.',
        '**No second language.** No TypeScript files alongside JavaScript '
        'files, so nothing drifts out of sync.',
        '**Types are documented and checked** using annotations that live '
        'inside the JavaScript itself (Part XI).',
        '**The check is automated.** It runs in CI and fails the build on a '
        'type error.',
    ])

    story += CALLOUT(
        'warn', 'An honest weakness in that configuration',
        'The `strict` option is currently set to `false`. That means null and '
        'undefined are not rigorously checked. For a codebase that handles '
        'money and airworthiness safety, `strict: true` would be the safer '
        'setting and would likely surface genuine defects. This is a known '
        'gap, recorded here rather than quietly omitted.')

    story += H2('Reading the code samples')

    story += P(
        'Samples are reproduced exactly as they appear in the repository, '
        'including comments. Where a sample is long, only the relevant part is '
        'shown.')

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
  const frac2 = (frac + '00').slice(0, 2);
  const value = Number(whole || '0') * 100 + Number(frac2);
  const signed = sign === '-' ? -value : value;
  if (!Number.isSafeInteger(signed)) {
    throw new MoneyError(`Monetary amount out of safe integer range: "${input}"`, 'MONEY_OVERFLOW');
  }
  return signed;
}''',
        'shared/src/money.js — turns the text "1,234.56" into the integer '
        '123456. Part III explains why this function exists at all.')

    story += H2('A word on how to read the rest of this')

    story += P(
        'Some parts of this guide describe genuinely hard mathematics — '
        'particularly Part VIII, on route planning. Those sections are written '
        'so that the *argument* can be followed without the algebra. The point '
        'is not for you to be able to re-derive the proof at your desk. The '
        'point is that you should be able to understand why the engineers '
        'trust it, and therefore whether you should.')

    story += P(
        'Where something is a judgement call rather than a fact, this document '
        'says so. Part XIII documents six real defects found in this codebase, '
        'including two where the code and its tests were wrong in the same way. '
        'A system that has never been wrong has not been tested.')