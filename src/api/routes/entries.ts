/**
 * Entry Routes
 *
 * Full CRUD operations for collection entries.
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
import { forbidden, fromZodError, internalError, notFound } from '@/api/middleware/errors.js';
import type { AuthVariables } from '@/api/middleware/auth.js';
import { can } from '@/core/permissions.js';
import type { JsonObject, Permission, QueryOptions, SortOption } from '@/types/index.js';

type Env = { Variables: AuthVariables };

const router = new Hono<Env>();

// ============================================================================
// Schemas
// ============================================================================

const entryStatusEnum = z.enum(['draft', 'published', 'scheduled']);

const createSchema = z.object({
    title: z.string().min(1, 'Title is required'),
    slug: z.string().regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens').optional(),
    fields: z.record(z.string(), z.unknown()).optional(),
    status: entryStatusEnum.optional(),
    publishAt: z.iso.datetime({ offset: true }).nullable().optional(),
});

const updateSchema = z.object({
    title: z.string().min(1, 'Title cannot be empty').optional(),
    slug: z.string().regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens').optional(),
    fields: z.record(z.string(), z.unknown()).optional(),
    status: entryStatusEnum.optional(),
    publishAt: z.iso.datetime({ offset: true }).nullable().optional(),
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
    const role = c.var.role;
    if (!can(role, `entry:read:${collection}` as Permission)) return forbidden(c);

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
    const role = c.var.role;
    if (!can(role, `entry:read:${collection}` as Permission)) return forbidden(c);

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
    const role = c.var.role;
    if (!can(role, `entry:read:${collection}` as Permission)) return forbidden(c);

    const api = requireCollection(collection);
    if (!api) return notFound(c, `Collection '${collection}' not found`);

    try {
        const options = parseQueryOptions(c.req.query());
        const entry = await api.get(id, options);
        if (!entry) return notFound(c, `Entry '${id}' not found`);
        return c.json({ data: entry });
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

// ============================================================================
// POST /collections/:collection
// ============================================================================

router.post('/:collection', async (c) => {
    const { collection } = c.req.param();
    const role = c.var.role;
    if (!can(role, `entry:create:${collection}` as Permission)) return forbidden(c);

    const api = requireCollection(collection);
    if (!api) return notFound(c, `Collection '${collection}' not found`);

    try {
        const raw = await c.req.json();
        const parsed = createSchema.safeParse(raw);
        if (!parsed.success) return fromZodError(c, parsed.error);

        const { title, slug, fields, status, publishAt } = parsed.data;

        const entry = await api.create({
            title,
            ...(slug !== undefined && { slug }),
            ...(fields !== undefined && { fields: fields as JsonObject }),
            ...(status !== undefined && { status }),
            ...(publishAt !== undefined && { publishAt: publishAt ? new Date(publishAt) : null }),
        });

        return c.json({ data: entry }, 201);
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

// ============================================================================
// POST /collections/:collection/query
// ============================================================================

router.post('/:collection/query', async (c) => {
    const { collection } = c.req.param();
    const role = c.var.role;
    if (!can(role, `entry:read:${collection}` as Permission)) return forbidden(c);

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
    const role = c.var.role;
    if (!can(role, `entry:update:${collection}` as Permission)) return forbidden(c);

    const api = requireCollection(collection);
    if (!api) return notFound(c, `Collection '${collection}' not found`);

    try {
        const entry = await api.restore(id);
        return c.json({ data: entry });
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

// ============================================================================
// POST /collections/:collection/:id/duplicate
// ============================================================================

router.post('/:collection/:id/duplicate', async (c) => {
    const { collection, id } = c.req.param();
    const role = c.var.role;
    if (!can(role, `entry:create:${collection}` as Permission)) return forbidden(c);

    const api = requireCollection(collection);
    if (!api) return notFound(c, `Collection '${collection}' not found`);

    try {
        const entry = await api.duplicate(id);
        return c.json({ data: entry }, 201);
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

// ============================================================================
// PUT /collections/:collection/:id
// ============================================================================

router.put('/:collection/:id', async (c) => {
    const { collection, id } = c.req.param();
    const role = c.var.role;
    if (!can(role, `entry:update:${collection}` as Permission)) return forbidden(c);

    const api = requireCollection(collection);
    if (!api) return notFound(c, `Collection '${collection}' not found`);

    try {
        const raw = await c.req.json();
        const parsed = updateSchema.safeParse(raw);
        if (!parsed.success) return fromZodError(c, parsed.error);

        const { title, slug, fields, status, publishAt } = parsed.data;

        // Check publish permission when setting status to published
        if (parsed.data.status === 'published') {
            if (!can(role, `entry:publish:${collection}` as Permission)) return forbidden(c);
        }

        const entry = await api.update(id, {
            ...(title !== undefined && { title }),
            ...(slug !== undefined && { slug }),
            ...(fields !== undefined && { fields: fields as JsonObject }),
            ...(status !== undefined && { status }),
            ...(publishAt !== undefined && { publishAt: publishAt ? new Date(publishAt) : null }),
        });

        return c.json({ data: entry });
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

// ============================================================================
// DELETE /collections/:collection/trash  (empty trash)
// ============================================================================

router.delete('/:collection/trash', async (c) => {
    const { collection } = c.req.param();
    const role = c.var.role;
    if (!can(role, `entry:delete:${collection}` as Permission)) return forbidden(c);

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
    const role = c.var.role;
    if (!can(role, `entry:delete:${collection}` as Permission)) return forbidden(c);

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
    const role = c.var.role;
    if (!can(role, `entry:delete:${collection}` as Permission)) return forbidden(c);

    const api = requireCollection(collection);
    if (!api) return notFound(c, `Collection '${collection}' not found`);

    try {
        await api.trash(id);
        return c.json({ success: true });
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

// ============================================================================
// POST /collections/:collection/:id/publish
// ============================================================================

router.post('/:collection/:id/publish', async (c) => {
    const { collection, id } = c.req.param();
    const role = c.var.role;
    if (!can(role, `entry:publish:${collection}` as Permission)) return forbidden(c);

    const api = requireCollection(collection);
    if (!api) return notFound(c, `Collection '${collection}' not found`);

    try {
        const entry = await api.publish(id);
        return c.json({ data: entry });
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

// ============================================================================
// POST /collections/:collection/:id/unpublish
// ============================================================================

router.post('/:collection/:id/unpublish', async (c) => {
    const { collection, id } = c.req.param();
    const role = c.var.role;
    if (!can(role, `entry:publish:${collection}` as Permission)) return forbidden(c);

    const api = requireCollection(collection);
    if (!api) return notFound(c, `Collection '${collection}' not found`);

    try {
        const entry = await api.unpublish(id);
        return c.json({ data: entry });
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

// ============================================================================
// POST /collections/:collection/:id/schedule
// ============================================================================

const scheduleSchema = z.object({
    publishAt: z.iso.datetime({ offset: true }),
});

router.post('/:collection/:id/schedule', async (c) => {
    const { collection, id } = c.req.param();
    const role = c.var.role;
    if (!can(role, `entry:publish:${collection}` as Permission)) return forbidden(c);

    const api = requireCollection(collection);
    if (!api) return notFound(c, `Collection '${collection}' not found`);

    try {
        const raw = await c.req.json();
        const parsed = scheduleSchema.safeParse(raw);
        if (!parsed.success) return fromZodError(c, parsed.error);
        const entry = await api.schedule(id, new Date(parsed.data.publishAt));
        return c.json({ data: entry });
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

// ============================================================================
// GET /collections/:collection/:id/versions
// ============================================================================

router.get('/:collection/:id/versions', async (c) => {
    const { collection, id } = c.req.param();
    const role = c.var.role;
    if (!can(role, `entry:read:${collection}` as Permission)) return forbidden(c);

    const api = requireCollection(collection);
    if (!api) return notFound(c, `Collection '${collection}' not found`);

    try {
        const versions = await api.versions(id);
        return c.json({ data: versions });
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

// ============================================================================
// POST /collections/:collection/:id/versions/:versionId/restore
// ============================================================================

router.post('/:collection/:id/versions/:versionId/restore', async (c) => {
    const { collection, id, versionId } = c.req.param();
    const role = c.var.role;
    if (!can(role, `entry:update:${collection}` as Permission)) return forbidden(c);

    const api = requireCollection(collection);
    if (!api) return notFound(c, `Collection '${collection}' not found`);

    try {
        const entry = await api.restoreVersion(id, versionId);
        return c.json({ data: entry });
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

// ============================================================================
// GET /collections/:collection/:id/translations
// ============================================================================

router.get('/:collection/:id/translations', async (c) => {
    const { collection, id } = c.req.param();
    const role = c.var.role;
    if (!can(role, `entry:read:${collection}` as Permission)) return forbidden(c);

    const api = requireCollection(collection);
    if (!api) return notFound(c, `Collection '${collection}' not found`);

    try {
        const translations = await api.translations(id);
        return c.json({ data: translations });
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

// ============================================================================
// POST /collections/:collection/:id/translations  (create translation)
// ============================================================================

const createTranslationSchema = z.object({
    locale: z.string().min(1, 'Locale is required'),
    copyFields: z.boolean().optional(),
});

router.post('/:collection/:id/translations', async (c) => {
    const { collection, id } = c.req.param();
    const role = c.var.role;
    if (!can(role, `entry:create:${collection}` as Permission)) return forbidden(c);

    const api = requireCollection(collection);
    if (!api) return notFound(c, `Collection '${collection}' not found`);

    try {
        const raw = await c.req.json();
        const parsed = createTranslationSchema.safeParse(raw);
        if (!parsed.success) return fromZodError(c, parsed.error);

        const options: { copyFields?: boolean } = {};
        if (parsed.data.copyFields !== undefined) options.copyFields = parsed.data.copyFields;
        const entry = await api.createTranslation(id, parsed.data.locale, options);
        return c.json({ data: entry }, 201);
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

// ============================================================================
// GET /collections/:collection/:id/translations/:locale
// ============================================================================

router.get('/:collection/:id/translations/:locale', async (c) => {
    const { collection, id, locale } = c.req.param();
    const role = c.var.role;
    if (!can(role, `entry:read:${collection}` as Permission)) return forbidden(c);

    const api = requireCollection(collection);
    if (!api) return notFound(c, `Collection '${collection}' not found`);

    try {
        const entry = await api.getTranslation(id, locale);
        if (!entry) return notFound(c, `Translation for locale '${locale}' not found`);
        return c.json({ data: entry });
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

export { router as entriesRouter };
