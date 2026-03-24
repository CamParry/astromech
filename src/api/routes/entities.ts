/**
 * Entity Routes
 *
 * Full CRUD operations for collection entities.
 *
 * Routes:
 *   GET    /collections/:collection                   → all() or paginate()
 *   POST   /collections/:collection                   → create()
 *   POST   /collections/:collection/query             → where()
 *   GET    /collections/:collection/trashed           → trashed()
 *   DELETE /collections/:collection/trash             → emptyTrash()
 *   GET    /collections/:collection/:id               → get()
 *   PUT    /collections/:collection/:id               → update()
 *   DELETE /collections/:collection/:id               → trash()
 *   POST   /collections/:collection/:id/restore       → restore()
 *   DELETE /collections/:collection/:id/force         → delete()
 *   POST   /collections/:collection/:id/duplicate     → duplicate()
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { Astromech } from '@/sdk/server/index.js';
import { badRequest, fromZodError, internalError, notFound } from '@/api/middleware/errors.js';
import type { AuthVariables } from '@/api/middleware/auth.js';
import type { JsonObject, QueryOptions, SortOption } from '@/types/index.js';

type Env = { Variables: AuthVariables };

const router = new Hono<Env>();

// ============================================================================
// Schemas
// ============================================================================

const entityStatusEnum = z.enum(['draft', 'published', 'scheduled']);

const createSchema = z.object({
    title: z.string().min(1, 'Title is required'),
    slug: z.string().regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens').optional(),
    fields: z.record(z.string(), z.unknown()).optional(),
    status: entityStatusEnum.optional(),
    publishAt: z.string().datetime({ offset: true }).nullable().optional(),
});

const updateSchema = z.object({
    title: z.string().min(1, 'Title cannot be empty').optional(),
    slug: z.string().regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens').optional(),
    fields: z.record(z.string(), z.unknown()).optional(),
    status: entityStatusEnum.optional(),
    publishAt: z.string().datetime({ offset: true }).nullable().optional(),
});

// ============================================================================
// Helpers
// ============================================================================

function parseQueryOptions(query: Record<string, string>): QueryOptions {
    const options: QueryOptions = {};

    const populate = query['populate'];
    if (populate) options.populate = populate.split(',').filter(Boolean);

    const locale = query['locale'];
    if (locale) options.locale = locale;

    if (query['withTrashed'] === 'true') options.withTrashed = true;

    const sortField = query['sort'];
    if (sortField) {
        const dir = query['dir'] === 'asc' ? 'asc' : 'desc';
        options.sort = { field: sortField, direction: dir } as SortOption;
    }

    return options;
}

function requireCollection(collection: string) {
    if (!Astromech.config.collections[collection]) return null;
    return Astromech.collections[collection]!;
}

// ============================================================================
// GET /collections/:collection
// ============================================================================

router.get('/:collection', async (c) => {
    const { collection } = c.req.param();
    const api = requireCollection(collection);
    if (!api) return notFound(c, `Collection '${collection}' not found`);

    try {
        const query = c.req.query();
        const page = query['page'];
        const perPage = query['perPage'];
        const options = parseQueryOptions(query);

        if (page && perPage) {
            const result = await api.paginate(Number(perPage), Number(page), options);
            return c.json(result);
        }

        return c.json(await api.all(options));
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

// ============================================================================
// GET /collections/:collection/trashed
// ============================================================================

router.get('/:collection/trashed', async (c) => {
    const { collection } = c.req.param();
    const api = requireCollection(collection);
    if (!api) return notFound(c, `Collection '${collection}' not found`);

    try {
        const options = parseQueryOptions(c.req.query());
        return c.json(await api.trashed(options));
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

// ============================================================================
// GET /collections/:collection/:id
// ============================================================================

router.get('/:collection/:id', async (c) => {
    const { collection, id } = c.req.param();
    const api = requireCollection(collection);
    if (!api) return notFound(c, `Collection '${collection}' not found`);

    try {
        const options = parseQueryOptions(c.req.query());
        const entity = await api.get(id, options);
        if (!entity) return notFound(c, `Entity '${id}' not found`);
        return c.json({ data: entity });
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

// ============================================================================
// POST /collections/:collection
// ============================================================================

router.post('/:collection', async (c) => {
    const { collection } = c.req.param();
    const api = requireCollection(collection);
    if (!api) return notFound(c, `Collection '${collection}' not found`);

    try {
        const raw = await c.req.json();
        const parsed = createSchema.safeParse(raw);
        if (!parsed.success) return fromZodError(c, parsed.error);

        const { title, slug, fields, status, publishAt } = parsed.data;

        const entity = await api.create({
            title,
            ...(slug !== undefined && { slug }),
            ...(fields !== undefined && { fields: fields as JsonObject }),
            ...(status !== undefined && { status }),
            ...(publishAt !== undefined && { publishAt: publishAt ? new Date(publishAt) : null }),
        });

        return c.json({ data: entity }, 201);
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

// ============================================================================
// POST /collections/:collection/query
// ============================================================================

router.post('/:collection/query', async (c) => {
    const { collection } = c.req.param();
    const api = requireCollection(collection);
    if (!api) return notFound(c, `Collection '${collection}' not found`);

    try {
        const body = await c.req.json<{
            filters?: Record<string, unknown>;
            options?: QueryOptions;
        }>();

        return c.json(await api.where(body.filters ?? {}, body.options));
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

// ============================================================================
// POST /collections/:collection/:id/restore
// ============================================================================

router.post('/:collection/:id/restore', async (c) => {
    const { collection, id } = c.req.param();
    const api = requireCollection(collection);
    if (!api) return notFound(c, `Collection '${collection}' not found`);

    try {
        const entity = await api.restore(id);
        return c.json({ data: entity });
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

// ============================================================================
// POST /collections/:collection/:id/duplicate
// ============================================================================

router.post('/:collection/:id/duplicate', async (c) => {
    const { collection, id } = c.req.param();
    const api = requireCollection(collection);
    if (!api) return notFound(c, `Collection '${collection}' not found`);

    try {
        const entity = await api.duplicate(id);
        return c.json({ data: entity }, 201);
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

// ============================================================================
// PUT /collections/:collection/:id
// ============================================================================

router.put('/:collection/:id', async (c) => {
    const { collection, id } = c.req.param();
    const api = requireCollection(collection);
    if (!api) return notFound(c, `Collection '${collection}' not found`);

    try {
        const raw = await c.req.json();
        const parsed = updateSchema.safeParse(raw);
        if (!parsed.success) return fromZodError(c, parsed.error);

        const { title, slug, fields, status, publishAt } = parsed.data;

        const entity = await api.update(id, {
            ...(title !== undefined && { title }),
            ...(slug !== undefined && { slug }),
            ...(fields !== undefined && { fields: fields as JsonObject }),
            ...(status !== undefined && { status }),
            ...(publishAt !== undefined && { publishAt: publishAt ? new Date(publishAt) : null }),
        });

        return c.json({ data: entity });
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

// ============================================================================
// DELETE /collections/:collection/trash  (empty trash)
// ============================================================================

router.delete('/:collection/trash', async (c) => {
    const { collection } = c.req.param();
    const api = requireCollection(collection);
    if (!api) return notFound(c, `Collection '${collection}' not found`);

    try {
        await api.emptyTrash();
        return c.json({ success: true });
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

// ============================================================================
// DELETE /collections/:collection/:id/force  (force delete)
// ============================================================================

router.delete('/:collection/:id/force', async (c) => {
    const { collection, id } = c.req.param();
    const api = requireCollection(collection);
    if (!api) return notFound(c, `Collection '${collection}' not found`);

    try {
        await api.delete(id);
        return c.json({ success: true });
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

// ============================================================================
// DELETE /collections/:collection/:id  (soft delete)
// ============================================================================

router.delete('/:collection/:id', async (c) => {
    const { collection, id } = c.req.param();
    const api = requireCollection(collection);
    if (!api) return notFound(c, `Collection '${collection}' not found`);

    try {
        await api.trash(id);
        return c.json({ success: true });
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

export { router as entitiesRouter };
