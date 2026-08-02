/**
 * Google reCAPTCHA, verified against its `siteverify` endpoint. v3 carries a
 * numeric `score` this checks against `minScore`; v2 passes on `success` alone.
 */

import { siteverify } from '../siteverify.js';
import type { SpamProvider } from '../types.js';

const VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify';

const DEFAULT_MIN_SCORE = 0.5;

export type RecaptchaOptions = {
    siteKey: string;
    /** Read from `import.meta.env` in the site's config — never stored in content. */
    secretKey: string;
    /** v3 only. Default 0.5. */
    minScore?: number;
};

/** Build a reCAPTCHA provider for `forms({ spam })`. */
export function recaptcha(options: RecaptchaOptions): SpamProvider {
    const minScore = options.minScore ?? DEFAULT_MIN_SCORE;

    return {
        name: 'recaptcha',
        siteKey: options.siteKey,
        verify: async (token, context) => {
            const result = await siteverify(
                VERIFY_URL,
                options.secretKey,
                token,
                context.ip
            );
            if (!result.ok) return result;

            const { score } = result.body;
            if (typeof score === 'number' && score < minScore) {
                return { ok: false, reason: `Score ${score} below minimum ${minScore}` };
            }
            return { ok: true };
        },
    };
}
