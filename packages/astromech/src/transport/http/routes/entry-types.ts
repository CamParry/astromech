/**
 * Entry Types Metadata Routes
 *
 * Entry type configuration for the SPA to discover available types, fields
 * and display settings. Neither handler is in a REST route table — only the
 * resolved config, projected into a metadata shape, gated on `entry:{type}:read`.
 */

import type { AuthVariables } from '@/transport/http/middleware/auth';
import { OpenAPIHono } from '@hono/zod-openapi';
import { getConfig } from '@/config/registry';
import { resolveEntryType } from '@/entries/entry-types.shared';
import { entryPermission } from '@/permissions/entry-permission';
import { permissionsFor } from '@/permissions/permissions-for';
import { forbidden, notFound } from '@/transport/http/middleware/errors';

type Env = { Variables: AuthVariables };

const router = new OpenAPIHono<Env>();

// GET /entry-types — bespoke
// No method id, and the response is a bare array rather than an envelope.
router.get('/', (c) => {
    const { entries } = getConfig();
    const permissions = permissionsFor(c.var.role);

    const meta = Object.entries(entries)
        .filter(([type]) => permissions.allows(entryPermission(type, 'read')))
        .map(([type, config]) => ({
            type,
            single: config.single,
            plural: config.plural,
            versioning: config.versioning ?? false,
            slug: config.slug ?? null,
            adminColumns: config.adminColumns ?? [],
            fields: config.fields,
            capabilities: config.capabilities,
            titleField: config.titleField,
        }));

    return c.json(meta);
});

// GET /entry-types/:type — bespoke
// No method id. It resolves root and plugin-qualified ids alike through
// `resolveEntryType`, so `widgets/widget` serves here exactly as on `/entries`.
router.get('/:type', (c) => {
    const { type } = c.req.param();

    // Permission before existence, as on every entries route: a 404 an
    // unpermitted caller can read is a type enumeration.
    if (!permissionsFor(c.var.role).allows(entryPermission(type, 'read'))) {
        return forbidden(c);
    }

    const config = resolveEntryType(getConfig(), type);
    if (!config) return notFound(c, `Entry type '${type}' not found`);

    return c.json({
        type,
        single: config.single,
        plural: config.plural,
        versioning: config.versioning ?? false,
        slug: config.slug ?? null,
        adminColumns: config.adminColumns ?? [],
        fields: config.fields,
        capabilities: config.capabilities,
        titleField: config.titleField,
    });
});

export { router as entryTypesRouter };
