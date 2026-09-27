/**
 * The errors for a value our own code produced that its schema refuses: a
 * method's result, or what a hook handed back. The server's fault, not the
 * caller's, so neither is an `ApiError`: HTTP answers a 500 and logs the detail.
 */

import type { ZodError } from 'zod';
import { z } from 'zod';
import { AstromechError } from '@/errors/astromech-error';

/** Which resource a refused result was, when it names one. */
export type OutputSubject = { id?: string | undefined; locale?: string | undefined };

/** Thrown when a result fails its output schema on a key with no fallback. */
export class OutputValidationError extends AstromechError {
    /** What the result was, e.g. `The result of users.get`. */
    readonly source: string;
    readonly issues: ZodError['issues'];

    constructor(source: string, subject: OutputSubject, error: ZodError) {
        super(
            `${source} doesn't match its output schema${describeSubject(subject)}:\n` +
                z.prettifyError(error)
        );
        this.name = 'OutputValidationError';
        this.source = source;
        this.issues = error.issues;
    }
}

/**
 * Thrown when the data a hook leaves for the write fails the schema the call's
 * own input already passed, so the hook, not the caller, broke it. The message
 * names the hook and nothing of the data, since HTTP may show it.
 */
export class HookOutputValidationError extends AstromechError {
    /** The hook event, e.g. `global:beforeUpdate`. */
    readonly event: string;
    readonly issues: ZodError['issues'];

    constructor(event: string, error: ZodError) {
        super(`${event} returned data that fails its schema`);
        this.name = 'HookOutputValidationError';
        this.event = event;
        this.issues = error.issues;
    }
}

/** ` (id 8f2c…, locale en)`, or nothing when the result names neither. */
export function describeSubject(subject: OutputSubject): string {
    const parts = [
        ...(subject.id === undefined ? [] : [`id ${subject.id}`]),
        ...(subject.locale === undefined ? [] : [`locale ${subject.locale}`]),
    ];
    return parts.length === 0 ? '' : ` (${parts.join(', ')})`;
}
