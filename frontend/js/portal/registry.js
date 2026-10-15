/**
 * AMS — Who is using this, and what they see.
 *
 * Plan steps 1.6 (accountable-manager appointments) and 1.15 (five
 * functional portals, eleven honest phase-2 shells).
 *
 * WHY PERSONAS ARE HARDCODED AND SAY SO
 * -------------------------------------
 * A real operator cannot hold or renew its AOC without evidencing six
 * appointed posts, each carrying a regulatory approval state (CAAZ, SA-CAA,
 * EASA). That is why the six below are not "roles" in the permission sense
 * but posts with an approving authority attached.
 *
 * In the browser these are a select element, not authentication. Anyone can
 * pick the CEO. The UI states that on the switcher itself rather than
 * implying a security boundary that does not exist here. The SoD engine
 * still genuinely blocks the transitions it guards, because those rules
 * depend on WHO the actor is, not on whether the identity was verified.
 *
 * @module frontend/js/portal/registry
 */

/**
 * @typedef {Object} Persona
 * @property {string} id
 * @property {string} name
 * @property {string} title
 * @property {string} post           the accountable post code, if mandated
 * @property {string} [authority]    the regulator that approved the appointment
 * @property {boolean} [approved]
 * @property {string[]} roles
 * @property {string} portal         the portal this persona lands on
 */

/**
 * The six posts required by SA Civil Aviation Regulations 127.06.2(5),
 * corroborated by the Mauritius DoC AOC Guidance aligned to ICAO Doc 8335
 * and EU 2019/1139. A seventh persona (controller) exists but is not a
 * mandated post, and is labelled as such.
 *
 * @type {ReadonlyArray<Persona>}
 */
export const PERSONAS = Object.freeze([
  {
    id: 'p-ceo',
    name: 'R. Moyo',
    title: 'Chief Executive Officer',
    post: 'ceo',
    authority: 'CAAZ',
    approved: true,
    roles: ['ceo', 'approver'],
    portal: 'executive',
  },
  {
    id: 'p-cfo',
    name: 'T. Dube',
    title: 'Chief Financial Officer',
    post: '',
    roles: ['approver', 'budget_owner'],
    portal: 'finance',
  },
  {
    id: 'p-controller',
    name: 'M. Ncube',
    title: 'Financial Controller',
    post: '',
    roles: ['controller', 'approver'],
    portal: 'finance',
  },
  {
    id: 'p-proc',
    name: 'L. Chirwa',
    title: 'Head of Procurement',
    post: '',
    roles: ['requester', 'approver'],
    portal: 'procurement',
  },
  {
    id: 'p-tech',
    name: 'E. Banda',
    title: 'Head of Technical',
    post: 'aircraft',
    authority: 'CAAZ',
    approved: true,
    roles: ['requester', 'technical'],
    portal: 'technical',
  },
  {
    id: 'p-ops',
    name: 'K. Mutasa',
    title: 'Head of Flight Operations',
    post: 'flight_ops',
    authority: 'CAAZ',
    approved: true,
    roles: ['technical', 'dispatch'],
    portal: 'technical',
  },
  {
    id: 'p-safety',
    name: 'P. Sibanda',
    title: 'Air Safety Officer',
    post: 'safety_officer',
    authority: 'CAAZ',
    approved: true,
    roles: ['safety', 'approver'],
    portal: 'technical',
  },
  {
    id: 'p-it',
    name: 'S. Nyathi',
    title: 'Head of IT / MIS',
    post: '',
    roles: ['auditor', 'controller'],
    portal: 'itmis',
  },
]);

/** Persona id -> display name, for SoD messages. */
export const PERSONA_NAMES = Object.freeze(
  Object.fromEntries(PERSONAS.map((p) => [p.id, `${p.name}, ${p.title}`])),
);

/** The six mandated posts, with approval state. Plan step 1.6. */
export const MANDATED_POSTS = Object.freeze([
  'ceo', 'flight_ops', 'aircraft', 'safety_officer', 'quality_manager', 'security_manager',
]);

/**
 * An operator cannot hold or renew its AOC with any mandated post unfilled
 * or unapproved, so this is a live compliance question, not a formality.
 * `quality_manager` and `security_manager` are deliberately unfilled here:
 * an empty post is a finding, and hiding it would be the dishonest option.
 *
 * @returns {Array<{post: string, holder: Persona|null, finding: string|null}>}
 */
export function accountableManagerRegister() {
  return MANDATED_POSTS.map((post) => {
    const holder = PERSONAS.find((p) => p.post === post) ?? null;
    let finding = null;
    if (!holder) finding = 'VACANT — no accountable manager appointed';
    else if (!holder.approved) finding = 'UNAPPROVED — appointment lacks regulatory approval';
    return { post, holder, finding };
  });
}

/**
 * The five Wave 1 portals from plan step 1.15, each with the screens the
 * plan says must exist. `implemented` lists what this demo actually builds,
 * so the portal can be honest about its own coverage.
 *
 * @type {ReadonlyArray<{id: string, name: string, blurb: string,
 *   screens: ReadonlyArray<{name: string, implemented: boolean}>}>}
 */
export const PORTALS = Object.freeze([
  {
    id: 'finance',
    name: 'Finance & Treasury',
    blurb: 'Flight cost explorer, route P&L board, cost authority queue, budget builder',
    screens: [
      { name: 'Flight cost explorer', implemented: true },
      { name: 'Route P&L board', implemented: true },
      { name: 'Cost authority queue', implemented: true },
      { name: 'Budget builder', implemented: true },
    ],
  },
  {
    id: 'procurement',
    name: 'Procurement & Supply',
    blurb: 'Vendor registry, sourcing event list, contract register',
    screens: [
      { name: 'Vendor registry', implemented: false },
      { name: 'Sourcing event list', implemented: false },
      { name: 'Contract register', implemented: false },
    ],
  },
  {
    id: 'technical',
    name: 'Technical / Engineering',
    blurb: 'Fleet register, component register, AD/SB board, dispatch gate, check planning',
    screens: [
      { name: 'Fleet register', implemented: true },
      { name: 'AD/SB board', implemented: true },
      { name: 'Dispatch gate', implemented: true },
      { name: 'Component register', implemented: false },
      { name: 'Check planning', implemented: false },
    ],
  },
  {
    id: 'executive',
    name: 'Executive',
    blurb: 'Consolidated P&L, fleet performance, route verdict board, carbon exposure',
    screens: [
      { name: 'Consolidated P&L', implemented: true },
      { name: 'Route verdict board', implemented: true },
      { name: 'Carbon exposure', implemented: true },
      { name: 'Fleet performance', implemented: false },
    ],
  },
  {
    id: 'itmis',
    name: 'IT / MIS',
    blurb: 'Users, roles, delegations, cost taxonomy, audit chain verification',
    screens: [
      { name: 'Audit chain verification', implemented: true },
      { name: 'Accountable managers', implemented: true },
      { name: 'Users & roles', implemented: false },
      { name: 'Delegations', implemented: false },
      { name: 'Cost taxonomy', implemented: false },
    ],
  },
]);

/**
 * Phase 2 shells. Plan step 1.15 is explicit that these state what is
 * coming and carry NO fake data: "a portal showing fabricated figures trains
 * people to trust a screen that will be replaced."
 *
 * @type {ReadonlyArray<{name: string, posts: string}>}
 */
export const PHASE_2_SHELLS = Object.freeze([
  { name: 'Flight Deck & Crew Planning', posts: 'flight_ops' },
  { name: 'Cabin & Passenger Service', posts: 'ceo' },
  { name: 'Ground Operations & Turnaround', posts: 'ceo' },
  { name: 'Cargo & Commercial', posts: 'ceo' },
  { name: 'Quality Assurance', posts: 'quality_manager' },
  { name: 'Security & Regulatory Compliance', posts: 'security_manager' },
  { name: 'Safety Management System', posts: 'safety_officer' },
  { name: 'Engineering Configuration Control', posts: 'aircraft' },
  { name: 'Stores & Inventory', posts: 'ceo' },
  { name: 'Human Resources', posts: 'ceo' },
  { name: 'Corporate & Legal', posts: 'ceo' },
]);
