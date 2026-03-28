/**
 * Entry Routes
 *
 * Full CRUD operations for collection entries.
 *
 * Routes:
 *   GET    /entries/:type                   → all() or paginate()
 *   POST   /entries/:type                   → create()
 *   POST   /entries/:type/query             → where()
 *   GET    /entries/:type/trashed           → trashed()
 *   DELETE /entries/:type/trash             → emptyTrash()
 *   GET    /entries/:id                     → get()
 *   PUT    /entries/:id                     → update()
 *   DELETE /entries/:id                     → trash()
 *   POST   /entries/:id/restore             → restore()
 *   DELETE /entries/:id/force               → delete()
 *   POST   /entries/:id/duplicate           → duplicate()
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { Astromech } from '@/sdk/local/index.js';
import {
    forbidden,
    fromZodError,
    internalError,
    notFound,
} from '@/api/middleware/errors.js';
import type { AuthVariables } from '@/api/middleware/auth.js';
import { can } from '@/core/permissions.js';
import type { JsonObject, Permission, QueryOptions, SortOption } from '@/types/index.js';
import {
    createEntrySchema,
    updateEntrySchema,
    scheduleEntrySchema,
    createTranslationSchema,
} from '@/schemas/entries.js';

type Env = { Variables: AuthVariables };

const router = new OpenAPIHono<Env>();

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

function requireEntryType(type: string) {
    if (!Astromech.config.entries[type]) return null;
    return type;
}

// ============================================================================
// GET /entries/:type
// ============================================================================

const listEntriesRoute = createRoute({
    method: 'get',
    path: '/{type}',
    request: {
        params: z.object({ type: z.string().openapi({ example: 'post' }) }),
        query: z.object({
            page: z.string().optional().openapi({ example: '1' }),
            perPage: z.string().optional().openapi({ example: '20' }),
            status: z.string().optional().openapi({ example: 'published' }),
            search: z.string().optional(),
            locale: z.string().optional().openapi({ example: 'en' }),
            populate: z.string().optional(),
            sort: z.string().optional(),
            dir: z.enum(['asc', 'desc']).optional(),
            withTrashed: z.string().optional(),
        }),
    },
    responses: {
        200: { description: 'Entry list' },
    },
});

router.openapi(listEntriesRoute, async (c) => {
    console.log('test');

    const { type } = c.req.param();
    const role = c.var.role;
    if (!can(role, `entry:read:${type}` as Permission)) return forbidden(c);

    console.log('test1');
    if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);
    console.log('test2');

    try {
        const query = c.req.query();
        const page = query['page'];
        const perPage = query['perPage'];
        const options = { ...parseQueryOptions(query), type };
        console.log({ options });

        if (page && perPage) {
            const result = await Astromech.entries.paginate(
                Number(perPage),
                Number(page),
                options
            );
            console.log(result);
            return c.json(result);
        }

        return c.json(await Astromech.entries.all(options));
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

// ============================================================================
// GET /entries/:type/trashed
// ============================================================================

router.get('/:type/trashed', async (c) => {
    const { type } = c.req.param();
    const role = c.var.role;
    if (!can(role, `entry:read:${type}` as Permission)) return forbidden(c);

    if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

    try {
        const options = { ...parseQueryOptions(c.req.query()), type };
        return c.json(await Astromech.entries.trashed(options));
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

// ============================================================================
// GET /entries/:type/:id
// ============================================================================

const getEntryRoute = createRoute({
    method: 'get',
    path: '/{type}/{id}',
    request: {
        params: z.object({
            type: z.string().openapi({ example: 'post' }),
            id: z.string().openapi({ example: 'clx1234abc' }),
        }),
        query: z.object({
            populate: z.string().optional(),
            locale: z.string().optional(),
        }),
    },
    responses: {
        200: { description: 'Entry detail' },
        404: { description: 'Entry not found' },
    },
});

router.openapi(getEntryRoute, async (c) => {
    const { type, id } = c.req.param();
    const role = c.var.role;
    if (!can(role, `entry:read:${type}` as Permission)) return forbidden(c);

    if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

    try {
        const options = { ...parseQueryOptions(c.req.query()), type };
        const entry = await Astromech.entries.get(id, options);
        if (!entry) return notFound(c, `Entry '${id}' not found`);
        return c.json({ data: entry });
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

// ============================================================================
// POST /entries/:type
// ============================================================================

const createEntryRoute = createRoute({
    method: 'post',
    path: '/{type}',
    request: {
        params: z.object({ type: z.string().openapi({ example: 'post' }) }),
        body: {
            content: { 'application/json': { schema: createEntrySchema } },
            required: true,
        },
    },
    responses: {
        201: { description: 'Entry created' },
        422: { description: 'Validation error' },
    },
});

router.openapi(createEntryRoute, async (c) => {
    const { type } = c.req.param();
    const role = c.var.role;
    if (!can(role, `entry:create:${type}` as Permission)) return forbidden(c);

    if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

    try {
        const raw = await c.req.json();
        const parsed = createEntrySchema.safeParse(raw);
        if (!parsed.success) return fromZodError(c, parsed.error);

        const { title, slug, fields, status, publishAt } = parsed.data;

        const entry = await Astromech.entries.create({
            type,
            title,
            ...(slug !== undefined && { slug }),
            ...(fields !== undefined && { fields: fields as JsonObject }),
            ...(status !== undefined && { status }),
            ...(publishAt !== undefined && { publishAt }),
        });

        return c.json({ data: entry }, 201);
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

// ============================================================================
// POST /entries/:type/query
// ============================================================================

router.post('/:type/query', async (c) => {
    const { type } = c.req.param();
    const role = c.var.role;
    if (!can(role, `entry:read:${type}` as Permission)) return forbidden(c);

    if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

    try {
        const body = await c.req.json<{
            filters?: Record<string, unknown>;
            options?: QueryOptions;
        }>();

        return c.json(
            await Astromech.entries.where(body.filters ?? {}, { ...body.options, type })
        );
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

// ============================================================================
// POST /entries/:type/:id/restore
// ============================================================================

router.post('/:type/:id/restore', async (c) => {
    const { type, id } = c.req.param();
    const role = c.var.role;
    if (!can(role, `entry:update:${type}` as Permission)) return forbidden(c);

    if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

    try {
        const entry = await Astromech.entries.restore(id);
        return c.json({ data: entry });
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

// ============================================================================
// POST /entries/:type/:id/duplicate
// ============================================================================

router.post('/:type/:id/duplicate', async (c) => {
    const { type, id } = c.req.param();
    const role = c.var.role;
    if (!can(role, `entry:create:${type}` as Permission)) return forbidden(c);

    if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

    try {
        const entry = await Astromech.entries.duplicate(id);
        return c.json({ data: entry }, 201);
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

// ============================================================================
// PUT /entries/:type/:id
// ============================================================================

const updateEntryRoute = createRoute({
    method: 'put',
    path: '/{type}/{id}',
    request: {
        params: z.object({
            type: z.string().openapi({ example: 'post' }),
            id: z.string().openapi({ example: 'clx1234abc' }),
        }),
        body: {
            content: { 'application/json': { schema: updateEntrySchema } },
            required: true,
        },
    },
    responses: {
        200: { description: 'Entry updated' },
        422: { description: 'Validation error' },
    },
});

router.openapi(updateEntryRoute, async (c) => {
    const { type, id } = c.req.param();
    const role = c.var.role;
    if (!can(role, `entry:update:${type}` as Permission)) return forbidden(c);

    if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

    try {
        const raw = await c.req.json();
        const parsed = updateEntrySchema.safeParse(raw);
        if (!parsed.success) return fromZodError(c, parsed.error);

        const { title, slug, fields, status, publishAt } = parsed.data;

        // Check publish permission when setting status to published
        if (parsed.data.status === 'published') {
            if (!can(role, `entry:publish:${type}` as Permission)) return forbidden(c);
        }

        const entry = await Astromech.entries.update(id, {
            ...(title !== undefined && { title }),
            ...(slug !== undefined && { slug }),
            ...(fields !== undefined && { fields: fields as JsonObject }),
            ...(status !== undefined && { status }),
            ...(publishAt !== undefined && { publishAt }),
        });

        return c.json({ data: entry });
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

// ============================================================================
// DELETE /entries/:type/trash  (empty trash)
// ============================================================================

router.delete('/:type/trash', async (c) => {
    const { type } = c.req.param();
    const role = c.var.role;
    if (!can(role, `entry:delete:${type}` as Permission)) return forbidden(c);

    if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

    try {
        await Astromech.entries.emptyTrash({ type });
        return c.json({ success: true });
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

// ============================================================================
// DELETE /entries/:type/:id/force  (force delete)
// ============================================================================

router.delete('/:type/:id/force', async (c) => {
    const { type, id } = c.req.param();
    const role = c.var.role;
    if (!can(role, `entry:delete:${type}` as Permission)) return forbidden(c);

    if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

    try {
        await Astromech.entries.delete(id);
        return c.json({ success: true });
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

// ============================================================================
// DELETE /entries/:type/:id  (soft delete)
// ============================================================================

const trashEntryRoute = createRoute({
    method: 'delete',
    path: '/{type}/{id}',
    request: {
        params: z.object({
            type: z.string().openapi({ example: 'post' }),
            id: z.string().openapi({ example: 'clx1234abc' }),
        }),
    },
    responses: {
        200: { description: 'Entry trashed' },
        404: { description: 'Entry not found' },
    },
});

router.openapi(trashEntryRoute, async (c) => {
    const { type, id } = c.req.param();
    const role = c.var.role;
    if (!can(role, `entry:delete:${type}` as Permission)) return forbidden(c);

    if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

    try {
        await Astromech.entries.trash(id);
        return c.json({ success: true });
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

// ============================================================================
// POST /entries/:type/:id/publish
// ============================================================================

router.post('/:type/:id/publish', async (c) => {
    const { type, id } = c.req.param();
    const role = c.var.role;
    if (!can(role, `entry:publish:${type}` as Permission)) return forbidden(c);

    if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

    try {
        const entry = await Astromech.entries.publish(id);
        return c.json({ data: entry });
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

// ============================================================================
// POST /entries/:type/:id/unpublish
// ============================================================================

router.post('/:type/:id/unpublish', async (c) => {
    const { type, id } = c.req.param();
    const role = c.var.role;
    if (!can(role, `entry:publish:${type}` as Permission)) return forbidden(c);

    if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

    try {
        const entry = await Astromech.entries.unpublish(id);
        return c.json({ data: entry });
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

// ============================================================================
// POST /entries/:type/:id/schedule
// ============================================================================

router.post('/:type/:id/schedule', async (c) => {
    const { type, id } = c.req.param();
    const role = c.var.role;
    if (!can(role, `entry:publish:${type}` as Permission)) return forbidden(c);

    if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

    try {
        const raw = await c.req.json();
        const parsed = scheduleEntrySchema.safeParse(raw);
        if (!parsed.success) return fromZodError(c, parsed.error);
        const entry = await Astromech.entries.schedule(id, parsed.data.publishAt);
        return c.json({ data: entry });
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

// ============================================================================
// GET /entries/:type/:id/versions
// ============================================================================

router.get('/:type/:id/versions', async (c) => {
    const { type, id } = c.req.param();
    const role = c.var.role;
    if (!can(role, `entry:read:${type}` as Permission)) return forbidden(c);

    if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

    try {
        const versions = await Astromech.entries.versions(id);
        return c.json({ data: versions });
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

// ============================================================================
// POST /entries/:type/:id/versions/:versionId/restore
// ============================================================================

router.post('/:type/:id/versions/:versionId/restore', async (c) => {
    const { type, id, versionId } = c.req.param();
    const role = c.var.role;
    if (!can(role, `entry:update:${type}` as Permission)) return forbidden(c);

    if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

    try {
        const entry = await Astromech.entries.restoreVersion(id, versionId);
        return c.json({ data: entry });
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

// ============================================================================
// GET /entries/:type/:id/translations
// ============================================================================

router.get('/:type/:id/translations', async (c) => {
    const { type, id } = c.req.param();
    const role = c.var.role;
    if (!can(role, `entry:read:${type}` as Permission)) return forbidden(c);

    if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

    try {
        const translations = await Astromech.entries.translations(id);
        return c.json({ data: translations });
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

// ============================================================================
// POST /entries/:type/:id/translations  (create translation)
// ============================================================================

router.post('/:type/:id/translations', async (c) => {
    const { type, id } = c.req.param();
    const role = c.var.role;
    if (!can(role, `entry:create:${type}` as Permission)) return forbidden(c);

    if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

    try {
        const raw = await c.req.json();
        const parsed = createTranslationSchema.safeParse(raw);
        if (!parsed.success) return fromZodError(c, parsed.error);

        const options: { copyFields?: boolean } = {};
        if (parsed.data.copyFields !== undefined)
            options.copyFields = parsed.data.copyFields;
        const entry = await Astromech.entries.createTranslation(
            id,
            parsed.data.locale,
            options
        );
        return c.json({ data: entry }, 201);
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

// ============================================================================
// GET /entries/:type/:id/translations/:locale
// ============================================================================

router.get('/:type/:id/translations/:locale', async (c) => {
    const { type, id, locale } = c.req.param();
    const role = c.var.role;
    if (!can(role, `entry:read:${type}` as Permission)) return forbidden(c);

    if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

    try {
        const entry = await Astromech.entries.getTranslation(id, locale);
        if (!entry) return notFound(c, `Translation for locale '${locale}' not found`);
        return c.json({ data: entry });
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

export { router as entriesRouter };
