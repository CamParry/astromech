/**
 * Entry Routes
 *
 * Full CRUD operations for collection entries. See specs/typed-entries-api.md
 * for the surface contract (type-scoped routes, bulk-* sub-routes).
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
import type {
    EntryDuplicateOverrides,
    EntryQueryParams,
    EntryUpdateData,
    JsonObject,
    SortOption,
} from '@/types/index.js';
import {
    createEntrySchema,
    updateEntrySchema,
    scheduleEntrySchema,
} from '@/schemas/entries.js';

type Env = { Variables: AuthVariables };

const router = new OpenAPIHono<Env>();

// ============================================================================
// Helpers
// ============================================================================

const SORTABLE_FIELDS = new Set([
    'title',
    'status',
    'createdAt',
    'updatedAt',
    'publishedAt',
    'slug',
]);

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

function cascadeLocalesFromQuery(query: Record<string, string>): boolean {
    return query['cascadeLocales'] === 'true' || query['cascadeLocales'] === '1';
}

function requireEntryType(type: string) {
    if (!Astromech.config.entries[type]) return null;
    return type;
}

const bulkIdsSchema = z.object({
    ids: z.array(z.string().min(1)).min(1),
});

const bulkUpdateSchema = z.object({
    ids: z.array(z.string().min(1)).min(1),
    data: updateEntrySchema,
});

const bulkScheduleSchema = z.object({
    ids: z.array(z.string().min(1)).min(1),
    publishAt: z.union([
        z.date(),
        z
            .string()
            .datetime({ offset: true })
            .transform((v) => new Date(v)),
    ]),
});

const bulkTrashOrDeleteSchema = z.object({
    ids: z.array(z.string().min(1)).min(1),
    cascadeLocales: z.boolean().optional(),
});

// ============================================================================
// POST /entries/query  (cross-type)
// Registered BEFORE any /:type/... route so it isn't shadowed.
// ============================================================================

router.post('/query', async (c) => {
    const role = c.var.role;
    try {
        const body = await c.req.json<EntryQueryParams>();
        const typeParam = body.type;
        const types = Array.isArray(typeParam)
            ? Array.from(typeParam)
            : typeParam
              ? [typeParam as string]
              : [];

        if (types.length === 0) {
            return c.json(
                {
                    error: {
                        code: 'invalid_input',
                        message: '`type` is required (string or string[])',
                        status: 400,
                    },
                },
                400
            );
        }

        for (const t of types) {
            if (!requireEntryType(t)) return notFound(c, `Entry type '${t}' not found`);
            if (!can(role, `entry:${t}:read`)) return forbidden(c);
        }

        const validatedSort = validateSort(body.sort);
        const params: EntryQueryParams & { type: string | readonly string[] } = {
            ...body,
            type: types,
            ...(validatedSort !== undefined ? { sort: validatedSort } : {}),
        };
        return c.json(await Astromech.entries.query(params));
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

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
    if (!can(role, `entry:${type}:read`)) return forbidden(c);
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
    if (!can(role, `entry:${type}:read`)) return forbidden(c);

    if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

    try {
        const options = parseQueryParams(c.req.query());
        const entry = await Astromech.entries.get({
            type,
            id,
            ...(options.populate ? { populate: options.populate } : {}),
            ...(options.locale ? { locale: options.locale } : {}),
        });
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
    if (!can(role, `entry:${type}:create`)) return forbidden(c);

    if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

    try {
        const raw = await c.req.json();
        const parsed = createEntrySchema.safeParse(raw);
        if (!parsed.success) return fromZodError(c, parsed.error);

        const { title, slug, fields, status, publishAt, locale, localeGroup } =
            parsed.data;

        const entry = await Astromech.entries.create({
            type,
            title,
            ...(slug !== undefined && { slug }),
            ...(locale !== undefined && { locale }),
            ...(localeGroup !== undefined && { localeGroup }),
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
// POST /entries/:type/query  (single-type)
// ============================================================================

router.post('/:type/query', async (c) => {
    const { type } = c.req.param();
    const role = c.var.role;
    if (!can(role, `entry:${type}:read`)) return forbidden(c);

    if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

    try {
        const body = await c.req.json<Omit<EntryQueryParams, 'type'>>();
        const validatedSort = validateSort(body.sort);
        const params: EntryQueryParams & { type: string } = {
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
// POST /entries/:type/bulk-update
// ============================================================================

router.post('/:type/bulk-update', async (c) => {
    const { type } = c.req.param();
    const role = c.var.role;
    if (!can(role, `entry:${type}:update`)) return forbidden(c);
    if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

    try {
        const raw = await c.req.json();
        const parsed = bulkUpdateSchema.safeParse(raw);
        if (!parsed.success) return fromZodError(c, parsed.error);

        const { ids, data } = parsed.data;

        if (data.status === 'published') {
            if (!can(role, `entry:${type}:publish`)) return forbidden(c);
        }

        const entries = await Astromech.entries.update({
            type,
            id: ids,
            data: data as EntryUpdateData,
        });
        return c.json({ data: entries });
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

// ============================================================================
// POST /entries/:type/bulk-trash
// ============================================================================

router.post('/:type/bulk-trash', async (c) => {
    const { type } = c.req.param();
    const role = c.var.role;
    if (!can(role, `entry:${type}:delete`)) return forbidden(c);
    if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

    try {
        const raw = await c.req.json();
        const parsed = bulkTrashOrDeleteSchema.safeParse(raw);
        if (!parsed.success) return fromZodError(c, parsed.error);

        await Astromech.entries.trash({
            type,
            id: parsed.data.ids,
            ...(parsed.data.cascadeLocales ? { cascadeLocales: true } : {}),
        });
        return c.json({ success: true });
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

// ============================================================================
// POST /entries/:type/bulk-delete
// ============================================================================

router.post('/:type/bulk-delete', async (c) => {
    const { type } = c.req.param();
    const role = c.var.role;
    if (!can(role, `entry:${type}:delete`)) return forbidden(c);
    if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

    try {
        const raw = await c.req.json();
        const parsed = bulkTrashOrDeleteSchema.safeParse(raw);
        if (!parsed.success) return fromZodError(c, parsed.error);

        await Astromech.entries.delete({
            type,
            id: parsed.data.ids,
            ...(parsed.data.cascadeLocales ? { cascadeLocales: true } : {}),
        });
        return c.json({ success: true });
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

// ============================================================================
// POST /entries/:type/bulk-restore
// ============================================================================

router.post('/:type/bulk-restore', async (c) => {
    const { type } = c.req.param();
    const role = c.var.role;
    if (!can(role, `entry:${type}:update`)) return forbidden(c);
    if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

    try {
        const raw = await c.req.json();
        const parsed = bulkIdsSchema.safeParse(raw);
        if (!parsed.success) return fromZodError(c, parsed.error);

        const entries = await Astromech.entries.restore({ type, id: parsed.data.ids });
        return c.json({ data: entries });
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

// ============================================================================
// POST /entries/:type/bulk-publish
// ============================================================================

router.post('/:type/bulk-publish', async (c) => {
    const { type } = c.req.param();
    const role = c.var.role;
    if (!can(role, `entry:${type}:publish`)) return forbidden(c);
    if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

    try {
        const raw = await c.req.json();
        const parsed = bulkIdsSchema.safeParse(raw);
        if (!parsed.success) return fromZodError(c, parsed.error);

        const entries = await Astromech.entries.publish({ type, id: parsed.data.ids });
        return c.json({ data: entries });
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

// ============================================================================
// POST /entries/:type/bulk-unpublish
// ============================================================================

router.post('/:type/bulk-unpublish', async (c) => {
    const { type } = c.req.param();
    const role = c.var.role;
    if (!can(role, `entry:${type}:publish`)) return forbidden(c);
    if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

    try {
        const raw = await c.req.json();
        const parsed = bulkIdsSchema.safeParse(raw);
        if (!parsed.success) return fromZodError(c, parsed.error);

        const entries = await Astromech.entries.unpublish({ type, id: parsed.data.ids });
        return c.json({ data: entries });
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

// ============================================================================
// POST /entries/:type/bulk-schedule
// ============================================================================

router.post('/:type/bulk-schedule', async (c) => {
    const { type } = c.req.param();
    const role = c.var.role;
    if (!can(role, `entry:${type}:publish`)) return forbidden(c);
    if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

    try {
        const raw = await c.req.json();
        const parsed = bulkScheduleSchema.safeParse(raw);
        if (!parsed.success) return fromZodError(c, parsed.error);

        const entries = await Astromech.entries.schedule({
            type,
            id: parsed.data.ids,
            publishAt: parsed.data.publishAt,
        });
        return c.json({ data: entries });
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
    if (!can(role, `entry:${type}:update`)) return forbidden(c);

    if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

    try {
        const entry = await Astromech.entries.restore({ type, id });
        return c.json({ data: entry });
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

// ============================================================================
// POST /entries/:type/:id/duplicate
// ============================================================================

const duplicateOverridesSchema = z
    .object({
        title: z.string().min(1).optional(),
        slug: z
            .string()
            .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
            .optional(),
        locale: z.string().min(1).optional(),
        localeGroup: z.string().min(1).optional(),
        fields: z.record(z.string(), z.unknown()).optional(),
        status: z.enum(['draft', 'published', 'scheduled']).optional(),
    })
    .partial();

router.post('/:type/:id/duplicate', async (c) => {
    const { type, id } = c.req.param();
    const role = c.var.role;
    if (!can(role, `entry:${type}:create`)) return forbidden(c);

    if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

    try {
        let overrides: Record<string, unknown> = {};
        try {
            const raw = await c.req.json();
            const parsed = duplicateOverridesSchema.safeParse(raw);
            if (!parsed.success) return fromZodError(c, parsed.error);
            overrides = parsed.data as Record<string, unknown>;
        } catch {
            // No body / empty body — proceed with no overrides.
        }
        const entry = await Astromech.entries.duplicate({
            type,
            id,
            overrides: overrides as EntryDuplicateOverrides,
        });
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
    if (!can(role, `entry:${type}:update`)) return forbidden(c);

    if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

    try {
        const raw = await c.req.json();
        const parsed = updateEntrySchema.safeParse(raw);
        if (!parsed.success) return fromZodError(c, parsed.error);

        const { title, slug, fields, status, publishAt } = parsed.data;

        if (parsed.data.status === 'published') {
            if (!can(role, `entry:${type}:publish`)) return forbidden(c);
        }

        const entry = await Astromech.entries.update({
            type,
            id,
            data: {
                ...(title !== undefined && { title }),
                ...(slug !== undefined && { slug }),
                ...(fields !== undefined && { fields: fields as JsonObject }),
                ...(status !== undefined && { status }),
                ...(publishAt !== undefined && { publishAt }),
            },
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
    if (!can(role, `entry:${type}:delete`)) return forbidden(c);

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
    if (!can(role, `entry:${type}:delete`)) return forbidden(c);

    if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

    try {
        await Astromech.entries.delete({
            type,
            id,
            cascadeLocales: cascadeLocalesFromQuery(c.req.query()),
        });
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
    if (!can(role, `entry:${type}:delete`)) return forbidden(c);

    if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

    try {
        await Astromech.entries.trash({
            type,
            id,
            cascadeLocales: cascadeLocalesFromQuery(c.req.query()),
        });
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
    if (!can(role, `entry:${type}:publish`)) return forbidden(c);

    if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

    try {
        const entry = await Astromech.entries.publish({ type, id });
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
    if (!can(role, `entry:${type}:publish`)) return forbidden(c);

    if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

    try {
        const entry = await Astromech.entries.unpublish({ type, id });
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
    if (!can(role, `entry:${type}:publish`)) return forbidden(c);

    if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

    try {
        const raw = await c.req.json();
        const parsed = scheduleEntrySchema.safeParse(raw);
        if (!parsed.success) return fromZodError(c, parsed.error);
        const entry = await Astromech.entries.schedule({
            type,
            id,
            publishAt: parsed.data.publishAt,
        });
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
    if (!can(role, `entry:${type}:read`)) return forbidden(c);

    if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

    try {
        const versions = await Astromech.entries.versions({ type, id });
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
    if (!can(role, `entry:${type}:update`)) return forbidden(c);

    if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

    try {
        const entry = await Astromech.entries.restoreVersion({ type, id, versionId });
        return c.json({ data: entry });
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

// ============================================================================
// GET /entries/:type/:id/incoming-relations
// ============================================================================

router.get('/:type/:id/incoming-relations', async (c) => {
    const { type, id } = c.req.param();
    const role = c.var.role;
    if (!can(role, `entry:${type}:read`)) return forbidden(c);

    if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

    try {
        const relations = await Astromech.entries.incomingRelations({ type, id });
        return c.json({ data: relations });
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

export { router as entriesRouter };
