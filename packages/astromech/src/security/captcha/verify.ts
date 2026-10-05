/**
 * The configured captcha check, for sign-in, the reset request and plugins such
 * as forms. Reads the config and request scope itself: a plugin has no config.
 */

import type { CaptchaVerdict, CaptchaWidget } from './types';
import { getConfig } from '@/config/registry';
import { resolveEnv } from '@/env';
import { AstromechError } from '@/errors/astromech-error';
import { globals } from '@/registry';
import { getRequestScope } from '@/request-scope/request-scope';
import { log } from '@/utilities/log';
import { verifyHcaptcha } from './providers/hcaptcha';
import { verifyRecaptcha } from './providers/recaptcha';
import { verifyTurnstile } from './providers/turnstile';

/** The configured widget (provider and site key), or undefined when no captcha is set. */
export function resolveCaptcha(): CaptchaWidget | undefined {
    const captcha = getConfig().security?.captcha;
    if (captcha === undefined) return undefined;
    return { provider: captcha.provider, siteKey: captcha.siteKey };
}

/**
 * Check `token` for `action` with the configured provider. Throws when none is
 * configured. Expected hostnames default to the current request's.
 */
export async function verifyCaptcha(input: {
    token: string | undefined;
    action: string;
    clientAddress?: string | undefined;
    hostname?: string | undefined;
}): Promise<CaptchaVerdict> {
    const captcha = getConfig().security?.captcha;
    if (captcha === undefined) {
        throw new AstromechError(
            'verifyCaptcha was called, but `security.captcha` is not configured.'
        );
    }

    const { token, action, clientAddress } = input;
    if (token === undefined || token.trim() === '') {
        return { ok: false, reason: 'Missing verification token' };
    }

    const secret = resolveEnv('ASTROMECH_CAPTCHA_SECRET');
    if (secret === undefined) {
        warnSecretMissing();
        return { ok: false, reason: 'No captcha secret is set' };
    }

    const hostname = input.hostname ?? requestHostname();
    const hostnames = captcha.hostnames ?? (hostname === undefined ? [] : [hostname]);
    const check = {
        secret,
        siteKey: captcha.siteKey,
        action,
        hostnames,
        clientAddress,
        minScore: captcha.minScore,
    };

    switch (captcha.provider) {
        case 'turnstile':
            return verifyTurnstile(token, check);
        case 'recaptcha':
            return verifyRecaptcha(token, check);
        case 'hcaptcha':
            return verifyHcaptcha(token, check);
    }
}

/** The hostname of the request in scope, when there is one. */
function requestHostname(): string | undefined {
    const request = getRequestScope()?.request;
    return request === undefined ? undefined : new URL(request.url).hostname;
}

/** Log once per process, so a missing secret is visible without a line per request. */
function warnSecretMissing(): void {
    const state = globals();
    if (state.captchaSecretMissingLogged === true) return;
    state.captchaSecretMissingLogged = true;
    log.error(
        '`security.captcha` is configured, but the captcha secret is not set, so every check fails. Set `ASTROMECH_CAPTCHA_SECRET`. This is logged once.'
    );
}
