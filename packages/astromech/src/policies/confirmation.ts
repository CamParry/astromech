/**
 * `evaluateConfirmation(method, args, options)` — the runaway-loop brake.
 *
 * A mutating call arrives without an answer and is turned back with
 * `input_required` plus the question to put to a human; the caller re-issues the
 * same call carrying the answer. Three actions, borrowed from MCP elicitation:
 * `accept` / `decline` / `cancel`.
 *
 * This is NOT a security boundary and must never be described as one. It is
 * stateless, so the "human approved this" it acts on is just a value the caller
 * supplied — a caller that wants to proceed can write
 * `_confirm: {action: 'accept'}` itself and nothing here can tell that apart
 * from a click. What it buys is a stop between an agent deciding to do something
 * and it happening: one extra turn, with the method and its concrete target
 * spelled out, which is enough to break a loop that has started deleting things.
 * `policies/scoped-services.ts` is the boundary; confirmation over an unscoped
 * handle protects nothing.
 *
 * Where real proof is needed, it has to arrive on a channel the requester does
 * not control — MCP's URL-mode elicitation, GitHub's sudo mode, S3 MFA-delete.
 * We already have that shape: staged entries plus a preview token, reviewed in
 * admin under a real session. That is layer 3 and it is not this file.
 *
 * A pure function at DISPATCH level rather than a service wrapper, deliberately:
 * MCP, the CLI and the in-process tool-loop all dispatch by manifest method, so
 * a wrapper per service handle would be three wrappers over the same decision.
 * Keeping it pure also keeps the module free of domain imports — and free of the
 * process-global state that made CVE-2026-48529 out of GitHub's lockdown cache.
 *
 * Three result-ish nouns sit close together and are not interchangeable:
 * `ConfirmAnswer` is the caller's reply, `ConfirmDecision` the verdict, and
 * `ConfirmOutcome` why a call stopped.
 */

import type { ManifestMethod } from '@/types/index';

// ============================================================================
// Types
// ============================================================================

/** Elicitation's three actions. */
export type ConfirmAction = 'accept' | 'decline' | 'cancel';

/** What a caller sends back on the second invocation. */
export type ConfirmAnswer = { action: ConfirmAction };

/** What confirmation asks for. MRTR-shaped, so a transport swap stays mechanical. */
export type ConfirmRequest = {
    /** The manifest id of the method being asked about. */
    method: string;
    /** Concrete question for a human — names the method AND its target. */
    message: string;
    destructive: boolean;
    /** The exact arguments the call would run with, `_confirm` already removed. */
    arguments: Record<string, unknown>;
};

/**
 * Why a call did not proceed.
 *
 * `declined` and `cancelled` are kept apart because elicitation keeps them
 * apart, and the difference is meaningful to whatever asked: a decline is an
 * answer ("no, don't do this") and the agent should move on; a cancel is the
 * absence of one ("abort, I'm not answering") and re-asking may be reasonable.
 * Both leave persisted state untouched — the check runs before the service, so
 * nothing has happened yet in either case.
 */
export type ConfirmOutcome =
    | { status: 'input_required'; requests: ConfirmRequest[] }
    | { status: 'declined'; method: string }
    | { status: 'cancelled'; method: string };

/**
 * Which methods need confirming. A predicate over the method, with two named
 * presets rather than a hardcoded rule — the right threshold differs per caller,
 * and a transport that wants "everything that touches users" should not have to
 * fork this module to get it.
 */
export type ConfirmTrigger =
    | 'mutating'
    | 'destructive'
    | ((method: ManifestMethod) => boolean);

export type ConfirmOptions = { trigger?: ConfirmTrigger | undefined };

/**
 * Proceed with the arguments as given, or stop with something to report. When
 * `proceed` is false there are NO arguments on the decision: a caller cannot
 * accidentally run a refused call by reaching for them.
 */
export type ConfirmDecision =
    | { proceed: true; args: Record<string, unknown> }
    | { proceed: false; outcome: ConfirmOutcome };

// ============================================================================
// The reserved key
// ============================================================================

/**
 * Where the answer rides.
 *
 * Underscore-reserved, matching the convention already used for the keys the
 * system owns inside author-shaped data — `_type`, `_disabled` and `_id` on
 * block and repeater instances. It sits in the argument object because P0a
 * normalised every service method to a single parameter object, so there is one
 * place to put it that every method shares.
 */
export const CONFIRM_KEY = '_confirm';

/** Argument keys that, when present, name what a call is about to act on. */
const TARGET_KEYS = ['type', 'id', 'key'] as const;

// ============================================================================
// Reading the answer
// ============================================================================

/**
 * The answer carried in `args`, or null when there isn't a usable one.
 *
 * Garbage fails CLOSED — an unrecognised `action`, a string where an object
 * belongs, `null`, an empty object all read as "not answered" and get asked
 * again. The alternative is a malformed answer being treated as any particular
 * action, and the only value that could be is `accept`, which would make a
 * typo into an approval.
 */
function readAnswer(args: Record<string, unknown>): ConfirmAnswer | null {
    const raw = args[CONFIRM_KEY];
    if (typeof raw !== 'object' || raw === null) return null;

    const action = (raw as { action?: unknown }).action;
    if (action !== 'accept' && action !== 'decline' && action !== 'cancel') return null;
    return { action };
}

/** `args` without the reserved key. Never mutates the input. */
function stripConfirm(args: Record<string, unknown>): Record<string, unknown> {
    if (!(CONFIRM_KEY in args)) return args;
    const { [CONFIRM_KEY]: _answer, ...rest } = args;
    return rest;
}

// ============================================================================
// The question
// ============================================================================

/** `type "posts", id "01J…"` — the parts of `args` that say what is being acted on. */
function describeTarget(args: Record<string, unknown>): string {
    const parts: string[] = [];
    for (const key of TARGET_KEYS) {
        const value = args[key];
        if (typeof value === 'string' && value.length > 0)
            parts.push(`${key} "${value}"`);
    }
    return parts.join(', ');
}

/**
 * The question a human is actually asked.
 *
 * It names the method id and, where the arguments carry one, the target. A
 * prompt reading "confirm this action?" is useless to the person it exists for
 * — they cannot tell a draft being saved from a site being emptied — and the
 * whole value of confirming is in that sentence.
 */
export function confirmMessage(
    method: ManifestMethod,
    args: Record<string, unknown>
): string {
    const target = describeTarget(args);
    const subject = target.length > 0 ? `"${method.id}" on ${target}` : `"${method.id}"`;
    const effect = method.destructive
        ? 'This is destructive: it removes or overwrites data and cannot be undone.'
        : 'This changes stored data.';
    return `Run ${subject}? ${effect}`;
}

// ============================================================================
// Triggering
// ============================================================================

/**
 * Does this method need an answer before it runs?
 *
 * Exported because a transport has to know the same thing this module does
 * before a call arrives — an MCP tool that will be confirmed must advertise the
 * reserved key in its schema, or it publishes a schema forbidding the one
 * argument that can unblock it.
 */
export function triggersConfirmation(
    method: ManifestMethod,
    options: ConfirmOptions
): boolean {
    const trigger = options.trigger ?? 'mutating';
    if (typeof trigger === 'function') return trigger(method);
    if (trigger === 'destructive') return method.destructive;
    return method.mutates;
}

// ============================================================================
// The decision
// ============================================================================

/**
 * Decide whether `method` may run with `args`.
 *
 * `_confirm` is stripped on EVERY path, confirmed or not. A service must never
 * see it: a method that got handed a stray one would pass it to a Zod schema
 * that rejects unknown keys, or — worse, on a method that takes a loose `fields`
 * record — store it.
 */
export function evaluateConfirmation(
    method: ManifestMethod,
    args: Record<string, unknown>,
    options: ConfirmOptions
): ConfirmDecision {
    const stripped = stripConfirm(args);

    if (!triggersConfirmation(method, options)) {
        return { proceed: true, args: stripped };
    }

    const answer = readAnswer(args);
    if (answer === null) {
        return {
            proceed: false,
            outcome: {
                status: 'input_required',
                requests: [
                    {
                        method: method.id,
                        message: confirmMessage(method, stripped),
                        destructive: method.destructive,
                        arguments: stripped,
                    },
                ],
            },
        };
    }

    switch (answer.action) {
        case 'accept':
            return { proceed: true, args: stripped };
        case 'decline':
            return { proceed: false, outcome: { status: 'declined', method: method.id } };
        case 'cancel':
            return {
                proceed: false,
                outcome: { status: 'cancelled', method: method.id },
            };
    }
}
