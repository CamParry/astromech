/**
 * The plugin's two hook events and their payloads. `forms:beforeSubmit` gates —
 * a subscriber that throws aborts the submission with nothing persisted.
 * `forms:afterSubmit` runs post-commit and is swallow-and-logged by core.
 */

import type { SubmissionMeta } from '../types.js';

export const BEFORE_SUBMIT = 'forms:beforeSubmit';
export const AFTER_SUBMIT = 'forms:afterSubmit';

export type FormsBeforeSubmitPayload = {
    form: { id: string; slug: string; title: string; spamProtection: boolean };
    /** Values already coerced and validated by core's field pipeline. */
    data: Record<string, unknown>;
    /** Spam-provider token supplied by the client, if any. */
    token?: string;
    meta?: SubmissionMeta;
};

export type FormsAfterSubmitPayload = FormsBeforeSubmitPayload & { submissionId: string };
