/**
 * The plugin's own `forms:beforeSubmit` subscriber: it checks the token with the
 * `spam` option, or with core's captcha when the site sets `security.captcha`.
 */
import type { FormsBeforeSubmitPayload } from '../hooks/events';
import type { SpamProvider } from './types';
import type { Hook } from 'astromech';
import { defineHook } from 'astromech';
import { BEFORE_SUBMIT } from '../hooks/events';
import { captchaSpamProvider } from './captcha';

/** Reject a submission whose spam token fails verification. */
export function spamHook(spam: SpamProvider | undefined): Hook {
    // The event has no `AstromechPluginHookEvents` entry at this package's build
    // time, so the payload arrives as `unknown`. Narrow in the body — annotating
    // the parameter makes the handler unassignable.
    return defineHook(BEFORE_SUBMIT, async (payload) => {
        const event = payload as FormsBeforeSubmitPayload;
        if (!event.form.spamProtection) return;

        const provider = spam ?? captchaSpamProvider();
        if (provider === undefined) return;

        const verdict = await provider.verify(event.token, {
            clientAddress: event.clientAddress,
        });
        if (verdict.ok) return;

        // Throwing is the gate: this propagates and aborts the submission.
        throw new Error(`Spam check failed: ${verdict.reason}`);
    });
}
