/** Cloudflare Turnstile, verified against its `siteverify` endpoint. */

import type { SpamProvider } from '../types';
import { siteverify } from '../siteverify';

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export type TurnstileOptions = {
    siteKey: string;
    /** Read from `import.meta.env` in the site's config — never stored in content. */
    secretKey: string;
};

/** Build a Turnstile provider for `forms({ spam })`. */
export function turnstile(options: TurnstileOptions): SpamProvider {
    return {
        name: 'turnstile',
        siteKey: options.siteKey,
        verify: async (token, context) => {
            const result = await siteverify(
                VERIFY_URL,
                options.secretKey,
                token,
                context.ip
            );
            if (!result.ok) return result;
            return { ok: true };
        },
    };
}
