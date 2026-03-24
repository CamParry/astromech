/**
 * Collections Metadata Routes
 *
 * Returns collection configuration for the SPA to discover available
 * collections, their fields, and display settings.
 *
 * Routes:
 *   GET /collections-meta            → all collection metadata
 *   GET /collections-meta/:name      → single collection metadata
 */

import { Hono } from 'hono';
import { Astromech } from '@/sdk/server/index.js';
import { internalError, notFound } from '@/api/middleware/errors.js';
import type { AuthVariables } from '@/api/middleware/auth.js';

type Env = { Variables: AuthVariables };

const router = new Hono<Env>();

// ============================================================================
// GET /collections-meta
// ============================================================================

router.get('/', (c) => {
    try {
        const { collections } = Astromech.config;

        const meta = Object.entries(collections).map(([name, config]) => ({
            name,
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
// GET /collections-meta/:name
// ============================================================================

router.get('/:name', (c) => {
    try {
        const { name } = c.req.param();
        const config = Astromech.config.collections[name];

        if (!config) return notFound(c, `Collection '${name}' not found`);

        return c.json({
            name,
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

export { router as collectionsMetaRouter };
