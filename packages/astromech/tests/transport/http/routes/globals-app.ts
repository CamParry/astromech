/**
 * The config and the mounted router the globals route tests share.
 *
 * The globals themselves are the service tests' set (`tests/services/globals/
 * globals-config.ts`), so a route test names the same `site`, `contact`,
 * `banner` and `theme` the service tests do, plus one plugin global to prove a
 * qualified key reaches the same handlers.
 */

import type { AstromechConfig, PluginDefinition, Role } from '@/types/index';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type { RouteEnv } from '@tests/mount-router';
import { adminRole, mountRouter } from '@tests/mount-router';
import { createGlobalsRouter } from '@/transport/http/routes/globals';
import { makeGlobalsConfig } from '../../../services/globals/globals-config';

/** A plugin declaring one global, reached as `seo/settings`. */
export const seoPlugin: PluginDefinition = {
    package: '@astromech/seo',
    globals: [
        {
            key: 'settings',
            label: 'SEO',
            fields: [{ name: 'titleTemplate', type: 'text', label: 'Title template' }],
        },
    ],
};

/** The service tests' globals, plus the seo plugin's. */
export function configWithGlobals(): AstromechConfig {
    return { ...makeGlobalsConfig(), plugins: [seoPlugin] };
}

/** The qualified plugin key, URL-encoded for the `:key` path segment. */
export const SEO = encodeURIComponent('seo/settings');

/** The globals router mounted in isolation, acting as `role`. */
export function app(role: Role = adminRole): OpenAPIHono<RouteEnv> {
    return mountRouter('/globals', createGlobalsRouter(), role);
}

/** A JSON request body, as every write route wants it. */
export function json(body: unknown): RequestInit {
    return {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    };
}

/** {@link json}, for the one route that writes with PUT. */
export function put(body: unknown): RequestInit {
    return { ...json(body), method: 'PUT' };
}
