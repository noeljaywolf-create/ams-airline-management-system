/**
 * AMS — Segregation of Duties.
 *
 * Plan step 1.8. Rules are a pure function invoked from INSIDE every state
 * transition, never from a controller. A controller that checks permissions
 * is a check that can be forgotten by the next controller; an evaluator
 * called from the transition cannot be bypassed without deliberately
 * omitting the call, and omitting it is visible in review.
 *
 * WHY THESE RULES EXIST
 * ---------------------
 * The control that stops an airline overspending is not a permission list.
 * It is the requirement that no single person can both create a
 * commitment and approve it, or both award a contract and release payment.
 * An operator that collapses those pairs has an audit finding and, in most
 * jurisdictions, a licence condition. So the pairs are modelled as data.
 *
 * HONEST SCOPE
 * ------------
 * These functions are complete and real. They are called on every
 * transition in this demo, and they genuinely block. What is NOT real here
 * is identity: personas are a select element, not authentication, and the
 * tenant is a constant. A real deployment takes actorId from a verified
 * token (plan step 1.5) and never from a request body. That distinction is
 * displayed in the UI rather than hidden, because a demo that lets you
 * impersonate the CFO without saying so is teaching the wrong lesson.
 *
 * @module frontend/js/portal/sod
 */

/**
 * @typedef {Object} TransitionContext
 * @property {string}  action         what is being attempted
 * @property {string}  actorId        who is attempting it
 * @property {string}  [authorId]     who created the underlying request
 * @property {string}  [approverId]   who is approving
 * @property {string}  [recommendedBy] who recommended an award
 * @property {string}  [releaserId]   who releases payment
 * @property {string}  [invoiceCreatedBy] who raised the invoice
 * @property {string}  [evaluatorId]  who is evaluating
 * @property {string[]} roles         roles held by the actor
 * @property {string}  [bidderTenantId]
 * @property {string}  [eventOwnerTenantId]
 *
 * @typedef {Object} SoDFailure
 * @property {string} rule    stable rule id
 * @property {string} code    machine code, e.g. SOD_SELF_APPROVAL
 * @property {string} reason  plain-language explanation for the user
 */

/**
 * The six rules from plan step 1.8, unchanged in substance.
 *
 * Each returns a failure object when violated, or null when clean.
 * `PERIOD_CERTIFIER_NO_AUTHORITY` is the odd one out: it is a capability
 * requirement rather than a pair-conflict, and it belongs here because the
 * plan groups it with the others and because enforcing it in the evaluator
 * is the only place it cannot be forgotten.
 *
 * @type {ReadonlyArray<{id: string, code: string, describe: string, test: (ctx: TransitionContext) => SoDFailure | null}>}
 */
export const SOD_RULES = Object.freeze([
  {
    id: 'SELF_APPROVAL',
    code: 'SOD_SELF_APPROVAL',
    describe: 'An author cannot approve their own request.',
    test: (ctx) => (ctx.authorId && ctx.actorId === ctx.authorId
      ? {
        rule: 'SELF_APPROVAL',
        code: 'SOD_SELF_APPROVAL',
        reason: `${personName(ctx.actorId)} raised this request, so cannot also approve it. `
          + 'Segregation of duties requires a different approver.',
      }
      : null),
  },
  {
    id: 'EVALUATOR_IS_AUTHOR',
    code: 'SOD_EVALUATOR_IS_AUTHOR',
    describe: 'An evaluator cannot evaluate a procurement they authored.',
    test: (ctx) => (ctx.evaluatorId && ctx.evaluatorId === ctx.authorId
      ? {
        rule: 'EVALUATOR_IS_AUTHOR',
        code: 'SOD_EVALUATOR_IS_AUTHOR',
        reason: `${personName(ctx.evaluatorId)} authored this procurement and cannot also `
          + 'evaluate it. Technical evaluation must be independent of the requester.',
      }
      : null),
  },
  {
    id: 'AWARD_APPROVER_IS_RECOMMENDER',
    code: 'SOD_AWARD_APPROVER_IS_RECOMMENDER',
    describe: 'The award approver cannot be the recommender.',
    test: (ctx) => (ctx.approverId && ctx.approverId === ctx.recommendedBy
      ? {
        rule: 'AWARD_APPROVER_IS_RECOMMENDER',
        code: 'SOD_AWARD_APPROVER_IS_RECOMMENDER',
        reason: `${personName(ctx.approverId)} recommended this award and cannot also approve it.`,
      }
      : null),
  },
  {
    id: 'PAYMENT_RELEASER_IS_ORIGINATOR',
    code: 'SOD_PAYMENT_RELEASER_IS_ORIGINATOR',
    describe: 'Payment cannot be released by whoever raised the invoice.',
    test: (ctx) => (ctx.releaserId && ctx.releaserId === ctx.invoiceCreatedBy
      ? {
        rule: 'PAYMENT_RELEASER_IS_ORIGINATOR',
        code: 'SOD_PAYMENT_RELEASER_IS_ORIGINATOR',
        reason: `${personName(ctx.releaserId)} raised this invoice and cannot also release payment.`,
      }
      : null),
  },
  {
    id: 'SUPPLIER_BIDS_OWN_EVENT',
    code: 'SOD_SUPPLIER_BIDS_OWN_EVENT',
    describe: 'A supplier cannot bid on its own sourcing event.',
    test: (ctx) => (ctx.bidderTenantId && ctx.bidderTenantId === ctx.eventOwnerTenantId
      ? {
        rule: 'SUPPLIER_BIDS_OWN_EVENT',
        code: 'SOD_SUPPLIER_BIDS_OWN_EVENT',
        reason: 'A supplier may not submit a bid against an event it owns.',
      }
      : null),
  },
  {
    id: 'PERIOD_CERTIFIER_NO_AUTHORITY',
    code: 'SOD_NOT_AN_APPROVER',
    describe: 'Signing a period close requires the controller role.',
    test: (ctx) => (ctx.action === 'certify_period' && !ctx.roles.includes('controller')
      ? {
        rule: 'PERIOD_CERTIFIER_NO_AUTHORITY',
        code: 'SOD_NOT_AN_APPROVER',
        reason: `${personName(ctx.actorId)} does not hold the controller role and cannot `
          + 'certify a period close. Certification is an authority, not a formality.',
      }
      : null),
  },
]);

/**
 * Evaluate every rule. Returns ALL failures, not just the first, so the UI
 * can tell someone every reason their action is blocked in one pass rather
 * than making them discover them one at a time.
 *
 * @param {TransitionContext} ctx
 * @returns {SoDFailure[]}
 */
export function evaluateSoD(ctx) {
  return SOD_RULES.map((r) => r.test(ctx)).filter(Boolean);
}

/**
 * @param {TransitionContext} ctx
 * @returns {boolean} true when no rule is violated
 */
export function sodAllows(ctx) {
  return evaluateSoD(ctx).length === 0;
}

/* ---- named persons, so messages read like an organisation --------------
 *
 * Injected rather than imported from the portal registry to keep this
 * module a set of pure rules with no dependency on demo data. `registerNames`
 * is called once at boot; without it the fallback keeps messages usable.
 */
const NAME_BY_ID = new Map();

/** @param {Record<string, string>} names */
export function registerNames(names) {
  for (const [id, name] of Object.entries(names)) NAME_BY_ID.set(id, name);
}

function personName(id) {
  return NAME_BY_ID.get(id) ?? id;
}
