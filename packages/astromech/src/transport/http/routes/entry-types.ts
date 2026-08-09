/**
 * Entry Types Metadata Routes
 *
 * Returns entry type configuration for the SPA to discover available
 * entry types, their fields, and display settings.
 *
 * Neither handler is in a REST route table: there is no service method or
 * contract behind either, only `Astromech.config` projected into a metadata
 * shape.
 *
 * Routes:
 *   GET /entry-types            → all entry type metadata
 *   GET /entry-types/:type      → single entry type metadata
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import { Astromech } from '@/transport/local/index';
import { notFound } from '@/transport/http/middleware/errors';
import type { AuthVariables } from '@/transport/http/middleware/auth';

type Env = { Variables: AuthVariables };

const router = new OpenAPIHono<Env>();

// ============================================================================
// GET /entry-types — bespoke
// ============================================================================

// No method id, and the response is a bare array rather than an envelope.
router.get('/', (c) => {
    const { entries } = Astromech.config;

    const meta = Object.entries(entries).map(([type, config]) => ({
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

// ============================================================================
// GET /entry-types/:type — bespoke
// ============================================================================

// No method id, and it resolves only ROOT types via `config.entries[type]`, so
// a plugin entry type 404s here while it serves on `/entries`.
router.get('/:type', (c) => {
    const { type } = c.req.param();
    const config = Astromech.config.entries[type];

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
