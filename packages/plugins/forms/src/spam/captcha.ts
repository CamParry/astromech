/**
 * Core's captcha as a `SpamProvider`, so a form is protected with no `spam`
 * option when the site sets `security.captcha`.
 */

import type { SpamProvider } from './types';
import { CAPTCHA_ACTIONS, resolveCaptcha, verifyCaptcha } from 'astromech';

/** The provider for the site's `security.captcha`, or undefined when it sets none. Read at call time, since the config is not known when the plugin is built. */
export function captchaSpamProvider(): SpamProvider | undefined {
    const widget = resolveCaptcha();
    if (widget === undefined) return undefined;

    return {
        name: widget.provider,
        siteKey: widget.siteKey,
        verify: (token, context) =>
            verifyCaptcha({
                token,
                action: CAPTCHA_ACTIONS.formSubmit,
                clientAddress: context.clientAddress,
            }),
    };
}
