/**
 * The checks `security.captcha` needs beyond its type.
 */

import type { CaptchaConfig } from '@/security/captcha/types';
import { AstromechError } from '@/errors/astromech-error';
import { CAPTCHA_PROVIDERS } from '@/security/captcha/types';

/**
 * The provider is one core checks, `siteKey` is a non-empty string, `minScore`
 * is between 0 and 1 and only for reCAPTCHA, and `hostnames` are strings. A
 * value that would fail every check at request time fails at config resolution.
 */
export function assertCaptchaValid(captcha: CaptchaConfig | undefined): void {
    if (captcha === undefined) return;
    if (typeof captcha !== 'object' || captcha === null) {
        throw new AstromechError(
            `\`security.captcha\` must be an object, not ${JSON.stringify(captcha)}.`
        );
    }
    const { provider, siteKey, minScore, hostnames } = captcha;
    if (!CAPTCHA_PROVIDERS.includes(provider)) {
        throw new AstromechError(
            `\`security.captcha.provider\` must be one of ${CAPTCHA_PROVIDERS.join(', ')}, not ${JSON.stringify(provider)}.`
        );
    }
    if (typeof siteKey !== 'string' || siteKey.trim() === '') {
        throw new AstromechError(
            '`security.captcha.siteKey` must be a non-empty string.'
        );
    }
    if (minScore !== undefined) {
        if (provider !== 'recaptcha') {
            throw new AstromechError(
                '`security.captcha.minScore` applies to the `recaptcha` provider only.'
            );
        }
        if (typeof minScore !== 'number' || !(minScore >= 0 && minScore <= 1)) {
            throw new AstromechError(
                `\`security.captcha.minScore\` must be a number from 0 to 1, not ${JSON.stringify(minScore)}.`
            );
        }
    }
    if (
        hostnames !== undefined &&
        !(Array.isArray(hostnames) && hostnames.every((name) => typeof name === 'string'))
    ) {
        throw new AstromechError(
            '`security.captcha.hostnames` must be an array of strings.'
        );
    }
}
