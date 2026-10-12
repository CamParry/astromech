// The Cloudflare demo: the smallest site that exercises the runtime path.
// D1, R2, edge image transforms and Cron Triggers, all through bindings.
// `apps/demo` is the content showcase; this one proves the platform.
import type { CaptchaConfig } from 'astromech';
import { defineConfig } from 'astromech';
import { d1 } from 'astromech/database/d1';
import { consoleEmail } from 'astromech/email/console';
import * as fields from 'astromech/fields';
import { cloudflareImages } from 'astromech/media/image/cloudflare';
import { r2 } from 'astromech/storage/r2';

/**
 * A captcha only when the environment names one, so the testing deployment has
 * one for a captcha run only (`AGENTS.md`, "Testing deployment"). The build
 * reads this file in Node, for the admin's copy of the site key, and the Worker
 * reads it again at runtime, so both must see the same `CAPTCHA_PROVIDER` and
 * `CAPTCHA_SITE_KEY`.
 */
function captchaFromEnv(): CaptchaConfig | undefined {
    const { CAPTCHA_PROVIDER: provider, CAPTCHA_SITE_KEY: siteKey } = process.env;
    if (!provider || !siteKey) return undefined;
    if (provider !== 'turnstile' && provider !== 'recaptcha' && provider !== 'hcaptcha') {
        throw new Error(`CAPTCHA_PROVIDER names no captcha provider: ${provider}`);
    }
    return { provider, siteKey };
}

const captcha = captchaFromEnv();

export default defineConfig({
    db: d1({ binding: 'DB' }),
    storage: r2({ binding: 'MEDIA' }),
    media: { image: { driver: cloudflareImages() } },
    email: consoleEmail({ from: 'demo@astromech.dev' }),
    ...(captcha === undefined ? {} : { security: { captcha } }),
    // No `scheduler`: `createWorkerEntry` in `src/worker.ts` nominates
    // `cloudflareCron()`, and boot fails loudly in a Worker if it did not.
    entries: [
        {
            type: 'page',
            single: 'Page',
            plural: 'Pages',
            icon: 'FileText',
            url: '/{slug}',
            // For preview tokens, which `src/pages/[slug].astro` reads with.
            staging: true,
            fields: {
                main: [fields.richtext('body', { label: 'Body' })],
            },
        },
    ],
});
