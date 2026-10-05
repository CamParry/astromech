/**
 * Creates the application and establishes the request scope for every page
 * rendered on demand. Creation happens per request rather than at module scope
 * because Workers forbid I/O outside a request context.
 */

import type { RequestScope } from '@/request-scope/request-scope';
import type { AstromechConfig } from '@/types/index';
import type { MiddlewareHandler } from 'astro';
import { migrationNames, rawConfig } from 'virtual:astromech/config';
import { createAstromech } from '@/astromech';
import { assertAuthSecret } from '@/auth/better-auth';
import { setBundledMigrationNames } from '@/database/migration-registry';
import { resolveEnv, resolveNodeEnv } from '@/env';
import { AstromechError } from '@/errors/astromech-error';
import { readRemoteAddress } from '@/integrations/astro/remote-address';
import { isAdminPage, resolveInjectedRoute } from '@/integrations/astro/routes';
import { runInRequestScope } from '@/request-scope/request-scope';
import { isAddressBlocked } from '@/security/address-lists';
import { PRIVATE_NO_STORE } from '@/transport/http/cache-control';
import { resolveClientAddress } from '@/transport/http/client-address';
import { strictTransportSecurity } from '@/transport/http/strict-transport-security';

export const onRequest: MiddlewareHandler = async (context, next) => {
    // A page prerendered at build time gets no application, so a build neither
    // needs the secret nor runs scheduled jobs against the site's database.
    if (context.isPrerendered) return next();
    // Before the application is created, so a site missing its secret serves
    // nothing.
    assertAuthSecret();
    assertCaptchaSecret(rawConfig);
    if (migrationNames !== null) setBundledMigrationNames(migrationNames);
    const app = await createAstromech({ config: rawConfig });
    // The Node deployment has no external cron, so the serving integration is
    // what starts the in-process ticker. A no-op on Workers.
    await app.startScheduler();

    // The API refuses a blocked address itself, in the Hono app.
    const adminPage = isAdminPage(app.config, context.url.pathname);
    if (adminPage) {
        const address = resolveClientAddress(context.request, readRemoteAddress(context));
        if (address !== undefined && (await isAddressBlocked(address))) {
            return blockedPage();
        }
    }

    const scope: RequestScope = { request: context.request };
    const response = await runInRequestScope(scope, () => next());

    const route = resolveInjectedRoute(app.config, context.url.pathname);
    if (route === undefined && scope.noStore !== true) return response;
    // After the page, since a later `set()` would undo it. Astro warns on any
    // call when the site configures no cache provider.
    if (context.cache.enabled) context.cache.set(false);
    // A media file is public and keeps the media route's own lifetime; a page
    // that read with a preview token answers one visitor.
    const set: Record<string, string> =
        route === 'media' ? {} : { 'Cache-Control': PRIVATE_NO_STORE };
    const append: Record<string, string> = {};
    if (adminPage) {
        // A header, since a `<meta>` policy cannot carry `frame-ancestors`.
        // Appended: a policy the site sends too still applies.
        append['Content-Security-Policy'] = "frame-ancestors 'self'";
        const hsts = strictTransportSecurity(app.config.security?.hsts);
        if (hsts !== undefined) set['Strict-Transport-Security'] = hsts;
    }
    return withHeaders(response, set, append);
};

export default onRequest;

/**
 * Refuse to serve a configured captcha without its secret in production, where
 * every sign-in would otherwise fail with no sign of why.
 */
function assertCaptchaSecret(config: AstromechConfig): void {
    if (config.security?.captcha === undefined) return;
    if (resolveNodeEnv() !== 'production') return;
    if (resolveEnv('ASTROMECH_CAPTCHA_SECRET') !== undefined) return;
    throw new AstromechError(
        'Astromech requires missing env var: ASTROMECH_CAPTCHA_SECRET. `security.captcha` is set, and the secret is how the server checks a token. ' +
            'Set it in your environment or .env file, or on Cloudflare Workers with `wrangler secret put ASTROMECH_CAPTCHA_SECRET`.'
    );
}

/** Set `set` and append `append` on `response`, copying one whose headers are immutable. */
function withHeaders(
    response: Response,
    set: Record<string, string>,
    append: Record<string, string>
): Response {
    if (Object.keys(set).length === 0 && Object.keys(append).length === 0) {
        return response;
    }
    try {
        apply(response.headers, set, append);
        return response;
    } catch {
        const copy = new Response(response.body, response);
        apply(copy.headers, set, append);
        return copy;
    }
}

function apply(
    headers: Headers,
    set: Record<string, string>,
    append: Record<string, string>
): void {
    for (const [name, value] of Object.entries(set)) headers.set(name, value);
    for (const [name, value] of Object.entries(append)) headers.append(name, value);
}

/** The 403 an admin page answers a blocked address with. */
function blockedPage(): Response {
    return new Response('Forbidden', {
        status: 403,
        headers: {
            'Cache-Control': PRIVATE_NO_STORE,
            'Content-Type': 'text/plain; charset=utf-8',
        },
    });
}
