/**
 * The runaway-loop brake: a mutating call without an answer is turned back
 * with `input_required` until the caller re-issues it with `_confirm`. This is
 * NOT a security boundary — `policies/scoped-services.ts` is the actual gate.
 */

import type { ManifestMethod } from '@/types/index';

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
 * Why a call did not proceed. `declined` is an explicit no; `cancelled` is
 * the absence of an answer — callers should treat them differently. Neither
 * has touched persisted state, since the check runs before the service.
 */
export type ConfirmationResult =
    | { status: 'input_required'; requests: ConfirmRequest[] }
    | { status: 'declined'; method: string }
    | { status: 'cancelled'; method: string };

/**
 * Which methods need confirming: a predicate over the method, with `mutating`
 * and `destructive` presets so a caller doesn't have to fork this module for
 * a custom threshold.
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
    | { proceed: false; outcome: ConfirmationResult };

/**
 * Where the answer rides. Underscore-reserved, matching `_type`/`_disabled`/`_id`
 * on block and repeater instances; it lives in the argument object since every
 * service method takes a single parameter object.
 */
export const CONFIRM_KEY = '_confirm';

/** Argument keys that, when present, name what a call is about to act on. */
const TARGET_KEYS = ['type', 'id', 'key'] as const;

/**
 * The answer carried in `args`, or null when there isn't a usable one.
 * Garbage fails CLOSED — an unrecognised `action` or malformed value reads as
 * "not answered" rather than risk a typo being read as `accept`.
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
 * The question a human is actually asked: names the method id and, where the
 * arguments carry one, the target. "Confirm this action?" would be useless —
 * the value of confirming is in that specific sentence.
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

/**
 * Does this method need an answer before it runs? Exported because a
 * transport must know this before a call arrives — e.g. an MCP tool has to
 * advertise the reserved key in its schema when it will be confirmed.
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

/**
 * Decide whether `method` may run with `args`. `_confirm` is stripped on
 * EVERY path, confirmed or not — a service must never see it, since a stray
 * key would fail Zod validation or get stored on a loose `fields` record.
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
