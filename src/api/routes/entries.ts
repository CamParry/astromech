/**
 * Entry Routes
 *
 * Full CRUD operations for collection entries.
 *
 * Routes:
 *   GET    /entries/:type                   → query() with URL params
 *   POST   /entries/:type                   → create()
 *   POST   /entries/:type/query             → query() with body
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
import type { EntryQueryParams, JsonObject, Permission, SortOption } from '@/types/index.js';
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

const SORTABLE_FIELDS = new Set(['title', 'status', 'createdAt', 'updatedAt', 'publishedAt', 'slug']);

function validateSort(sort: unknown): SortOption | SortOption[] | undefined {
    if (!sort) return undefined;
    const validate = (s: unknown): SortOption | null => {
        if (typeof s !== 'object' || s === null || Array.isArray(s)) return null;
        const result: SortOption = {};
        for (const [key, val] of Object.entries(s as Record<string, unknown>)) {
            if (!SORTABLE_FIELDS.has(key)) continue;
            if (val !== 'asc' && val !== 'desc') continue;
            result[key] = val;
        }
        return Object.keys(result).length > 0 ? result : null;
    };
    if (Array.isArray(sort)) {
        const results = sort.map(validate).filter(Boolean) as SortOption[];
        return results.length > 0 ? results : undefined;
    }
    return validate(sort) ?? undefined;
}

function parseQueryParams(query: Record<string, string>): Omit<EntryQueryParams, 'type'> {
    const params: Omit<EntryQueryParams, 'type'> = {};

    const populate = query['populate'];
    if (populate) params.populate = populate.split(',').filter(Boolean);

    const locale = query['locale'];
    if (locale) params.locale = locale;

    if (query['trashed'] === 'true') params.trashed = true;

    if (query['search']) params.search = query['search'];

    const page = query['page'];
    if (page) params.page = Number(page);

    const limit = query['limit'];
    if (limit === 'all') params.limit = 'all';
    else if (limit) params.limit = Number(limit);

    const sortField = query['sort'];
    if (sortField) {
        const dir = query['dir'] === 'asc' ? 'asc' : 'desc';
        if (SORTABLE_FIELDS.has(sortField)) {
            params.sort = { [sortField]: dir };
        }
    }

    return params;
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
            page: z.string().optional(),
            limit: z.string().optional(),
            search: z.string().optional(),
            trashed: z.string().optional(),
            locale: z.string().optional().openapi({ example: 'en' }),
            populate: z.string().optional(),
            sort: z.string().optional(),
            dir: z.enum(['asc', 'desc']).optional(),
        }),
    },
    responses: {
        200: { description: 'Entry list' },
    },
});

router.openapi(listEntriesRoute, async (c) => {
    const { type } = c.req.param();
    const role = c.var.role;
    if (!can(role, `entry:read:${type}` as Permission)) return forbidden(c);
    if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

    try {
        const params = { ...parseQueryParams(c.req.query()), type };
        return c.json(await Astromech.entries.query(params));
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
        const options = { ...parseQueryParams(c.req.query()), type };
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
        const body = await c.req.json<Omit<EntryQueryParams, 'type'>>();
        const validatedSort = validateSort(body.sort);
        const params: EntryQueryParams = {
            ...body,
            type,
            ...(validatedSort !== undefined ? { sort: validatedSort } : {}),
        };
        return c.json(await Astromech.entries.query(params));
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
