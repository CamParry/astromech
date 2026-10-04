/**
 * The plugin's two hook events and their payloads. A `forms:beforeSubmit`
 * subscriber that throws refuses the submission with nothing stored; one on
 * `forms:afterSubmit` runs once the row is stored, and its throw fails the call.
 */

import type { SubmissionMeta } from '../types';

export const BEFORE_SUBMIT = 'forms:beforeSubmit';
export const AFTER_SUBMIT = 'forms:afterSubmit';

export type FormsBeforeSubmitPayload = {
    form: { id: string; slug: string; title: string; spamProtection: boolean };
    /** Values already coerced and validated by core's field pipeline. */
    data: Record<string, unknown>;
    /** Spam-provider token supplied by the client, if any. */
    token?: string;
    /**
     * The connecting address the HTTP transport trusts (`ctx.clientAddress`).
     * Absent for an in-process caller or where no trusted source exists.
     */
    clientAddress?: string;
    /** Caller-supplied metadata: stored, never trusted. */
    meta?: SubmissionMeta;
};

/** The stored submission's payload: the `forms:beforeSubmit` one without `clientAddress`. */
export type FormsAfterSubmitPayload = Omit<FormsBeforeSubmitPayload, 'clientAddress'> & {
    submissionId: string;
};
