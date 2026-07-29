/**
 * The plugin's own `forms:beforeSubmit` subscriber — the dogfooding proof
 * that a third-party plugin could gate a submission the same way. Registered
 * by `index.ts` only when `options.spam` is set.
 */

import type { DefinedHook } from 'astromech';
import { defineHook } from 'astromech';
import type { SpamOptions } from '../types.js';
import { BEFORE_SUBMIT, type FormsBeforeSubmitPayload } from '../hooks/events.js';
import { verifySpamToken } from './verify.js';

export function spamHook(spam: SpamOptions): DefinedHook {
    // `forms:beforeSubmit` has no entry in `AstromechPluginHookEvents` at this
    // package's build time (that interface is augmented per-site from the
    // resolved config), so `defineHook` contextually types the raw payload as
    // `unknown` here — narrow it explicitly rather than annotating the
    // parameter, which would make the handler unassignable to the wider type
    // `defineHook` expects.
    return defineHook(BEFORE_SUBMIT, async (payload) => {
        const event = payload as FormsBeforeSubmitPayload;
        if (!event.form.spamProtection) return;

        const verdict = await verifySpamToken(spam, event.token, event.meta?.ip);
        if (verdict.ok) return;

        // Throwing here IS the gate: `forms:beforeSubmit` runs through
        // `runBeforeHooks`, so this propagates and aborts the submission —
        // nothing is persisted. See `hooks/events.ts` for the full contract.
        throw new Error(`Spam check failed: ${verdict.reason}`);
    });
}
