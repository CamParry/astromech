/**
 * The plugin's own `forms:beforeSubmit` subscriber, registered only when the
 * site configured a spam provider.
 */

import type { DefinedHook } from 'astromech';
import { defineHook } from 'astromech';
import type { SpamOptions } from '../types.js';
import { BEFORE_SUBMIT, type FormsBeforeSubmitPayload } from '../hooks/events.js';
import { verifySpamToken } from './verify.js';

/** Reject a submission whose spam token fails verification. */
export function spamHook(spam: SpamOptions): DefinedHook {
    // The event has no `AstromechPluginHookEvents` entry at this package's build
    // time, so the payload arrives as `unknown`. Narrow in the body — annotating
    // the parameter makes the handler unassignable.
    return defineHook(BEFORE_SUBMIT, async (payload) => {
        const event = payload as FormsBeforeSubmitPayload;
        if (!event.form.spamProtection) return;

        const verdict = await verifySpamToken(spam, event.token, event.meta?.ip);
        if (verdict.ok) return;

        // Throwing is the gate: this propagates and aborts the submission.
        throw new Error(`Spam check failed: ${verdict.reason}`);
    });
}
