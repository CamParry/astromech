/**
 * The error for a result its output schema refuses: a stored value a required
 * key cannot do without. The server's fault, not the caller's, so it is no
 * `ApiError`: HTTP answers it with a generic 500 and logs the detail.
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

/** ` (id 8f2c…, locale en)`, or nothing when the result names neither. */
export function describeSubject(subject: OutputSubject): string {
    const parts = [
        ...(subject.id === undefined ? [] : [`id ${subject.id}`]),
        ...(subject.locale === undefined ? [] : [`locale ${subject.locale}`]),
    ];
    return parts.length === 0 ? '' : ` (${parts.join(', ')})`;
}
