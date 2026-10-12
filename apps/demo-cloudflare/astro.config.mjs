import cloudflare from '@astrojs/cloudflare';
import { cacheCloudflare } from '@astrojs/cloudflare/cache';
import react from '@astrojs/react';
import { defineConfig } from 'astro/config';
import { astromech } from 'astromech/astro';

/**
 * The sources `apps/docs/configuration/security.md` ("Content security
 * policy") lists for each captcha provider. `'self'` is the site's own.
 */
const CAPTCHA_CSP = {
    turnstile: {
        scriptDirective: {
            resources: ["'self'", 'https://challenges.cloudflare.com'],
        },
        directives: ['frame-src https://challenges.cloudflare.com'],
    },
    recaptcha: {
        scriptDirective: {
            resources: [
                "'self'",
                'https://www.google.com/recaptcha/',
                'https://www.gstatic.com/recaptcha/',
            ],
        },
        directives: [
            'frame-src https://www.google.com/recaptcha/ https://recaptcha.google.com/recaptcha/',
        ],
    },
    hcaptcha: {
        scriptDirective: {
            resources: ["'self'", 'https://hcaptcha.com', 'https://*.hcaptcha.com'],
        },
        styleDirective: {
            resources: ["'self'", 'https://hcaptcha.com', 'https://*.hcaptcha.com'],
        },
        directives: [
            'frame-src https://hcaptcha.com https://*.hcaptcha.com',
            "connect-src 'self' https://hcaptcha.com https://*.hcaptcha.com",
        ],
    },
};

// With a captcha on (`astromech.config.ts`), the site sends the policy the
// docs give for it, so a captcha run checks those sources too. Without one,
// `SECURITY_CSP=1` sends Astro's default policy, which `check:boot:cloudflare`
// builds with to check the admin's inline scripts are hashed.
const captchaProvider = process.env.CAPTCHA_PROVIDER;
const csp = captchaProvider
    ? CAPTCHA_CSP[captchaProvider]
    : process.env.SECURITY_CSP === '1' || undefined;

export default defineConfig({
    site: 'https://demo-cloudflare.astromech.dev',
    output: 'server',
    ...(csp ? { security: { csp } } : {}),
    adapter: cloudflare(),
    // Astromech does not use Astro sessions. Left on, the adapter adds a
    // `SESSION` KV binding, and `wrangler deploy` creates a namespace for it.
    session: false,
    // Astro's route cache, stored by Workers Caching (`cache` in
    // `wrangler.jsonc`). Every page may be stored for a minute, so the rule
    // reaches Astromech's own routes too, and `cache.set(false)` is what keeps
    // the admin, the API and a preview read out (`check:deployed:cloudflare`).
    cache: { provider: cacheCloudflare() },
    routeRules: { '/[...path]': { maxAge: 60 } },
    server: {
        port: 4324,
    },
    devToolbar: {
        enabled: false,
    },
    integrations: [astromech(), react()],
});
