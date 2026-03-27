/**
 * Entry Types Metadata Routes
 *
 * Returns entry type configuration for the SPA to discover available
 * entry types, their fields, and display settings.
 *
 * Routes:
 *   GET /entry-types            → all entry type metadata
 *   GET /entry-types/:type      → single entry type metadata
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import { Astromech } from '@/sdk/local/index.js';
import { internalError, notFound } from '@/api/middleware/errors.js';
import type { AuthVariables } from '@/api/middleware/auth.js';

type Env = { Variables: AuthVariables };

const router = new OpenAPIHono<Env>();

// ============================================================================
// GET /entry-types
// ============================================================================

router.get('/', (c) => {
    try {
        const { entries } = Astromech.config;

        const meta = Object.entries(entries).map(([type, config]) => ({
            type,
            single: config.single,
            plural: config.plural,
            versioning: config.versioning ?? false,
            slug: config.slug ?? null,
            adminColumns: config.adminColumns ?? [],
            fieldGroups: config.fieldGroups,
        }));

        return c.json(meta);
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

// ============================================================================
// GET /entry-types/:type
// ============================================================================

router.get('/:type', (c) => {
    try {
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
            fieldGroups: config.fieldGroups,
        });
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

export { router as entryTypesRouter };
