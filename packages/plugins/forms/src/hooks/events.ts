/**
 * The plugin's two declared hook events, and their typed payloads. Every
 * other slice imports these — this file is the single source of truth for
 * the shape of a form submission as it travels through the hook system.
 *
 * Semantics (load-bearing, not decoration): `forms:beforeSubmit` GATES — a
 * subscriber that throws aborts the submission and nothing is persisted.
 * `forms:afterSubmit` runs post-commit and is swallow-and-logged; a throwing
 * subscriber there is logged and has no effect on the result the caller sees.
 *
 * Core routes custom events by NAME: `emitEvent` sends any event whose name
 * contains `:before` through `runBeforeHooks` (throws propagate), and
 * everything else through `runAfterHooks` (swallow-and-log). That routing
 * rule is what makes the gate above true — see `emitEvent` in
 * `astromech/src/plugins/runtime/plugin-runtime.ts`, changed in commit
 * `ebd5d7b` on this branch specifically so this gate works. Before that
 * commit every emitted event was swallowed, and a throwing spam handler
 * would have been logged while the spam submission was saved anyway.
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
