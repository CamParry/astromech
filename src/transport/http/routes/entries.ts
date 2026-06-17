/**
 * Entry Routes
 *
 * Full CRUD operations for collection entries. See specs/typed-entries-api.md
 * for the surface contract (type-scoped routes, bulk-* sub-routes).
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { Astromech } from '@/transport/local/index.js';
import {
    forbidden,
    fromZodError,
    internalError,
    notFound,
} from '@/transport/http/middleware/errors.js';
import type { AuthVariables } from '@/transport/http/middleware/auth.js';
import { can, PERMISSION_ENTRY_READ_FULL } from '@/policies/permissions/permissions.js';
import type {
    EntryDuplicateOverrides,
    EntryQueryParams,
    EntryUpdateData,
    JsonObject,
    ResolvedEntryTypeConfig,
    SortOption,
} from '@/types/index.js';
import {
    updateEntrySchema,
    createEntrySchemaFor,
    updateEntrySchemaFor,
    scheduleEntrySchema,
} from '@/schemas/entries.js';

type Env = { Variables: AuthVariables };

// ============================================================================
// Router factory
// ============================================================================

/**
 * Actions a permission string is built for. Exactly the set the handlers below
 * reference (`entry:{type}:{action}`): read / create / update / delete / publish.
 */
export type EntryAction = 'read' | 'create' | 'update' | 'delete' | 'publish';

export type EntriesRouterOptions = {
    /** Resolve a bare type to its config; `undefined` ⇒ the existing 404 path. */
    lookup: (type: string) => ResolvedEntryTypeConfig | undefined;
    /** Wire a bare wire-type to the orchestrator's type id (root: identity; plugin: qualified). */
    qualify: (type: string) => string;
    /** Build the permission string a given action checks against. */
    permissionFor: (type: string, action: EntryAction) => string;
};

/**
 * Build an entries router. The root export wires the identity transform; a
 * plugin mount wires `lookup`/`qualify`/`permissionFor` to its own namespace.
 *
 * Response envelopes are passed through verbatim: entries returned by the
 * orchestrator carry whatever `type` it assigns (the qualified id for built-in
 * storage, or `undefined` for `tableStorage`). The wire format is not rewritten
 * — a plugin sees the orchestrator's `type` value as-is.
 */
export function createEntriesRouter(options: EntriesRouterOptions): OpenAPIHono<Env> {
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

    function parseQueryParams(
        query: Record<string, string>
    ): Omit<EntryQueryParams, 'type'> {
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

    /** Parse the `full` flag from a GET query string. */
    function parseFullFromQuery(query: Record<string, string>): boolean {
        return query['full'] === 'true';
    }

    /** Parse the `full` flag from a POST JSON body. */
    function parseFullFromBody(body: Record<string, unknown>): boolean {
        return body['full'] === true;
    }

    function cascadeLocalesFromQuery(query: Record<string, string>): boolean {
        return query['cascadeLocales'] === 'true' || query['cascadeLocales'] === '1';
    }

    function requireEntryType(type: string) {
        if (!options.lookup(type)) return null;
        return type;
    }

    function getTypeCapabilities(type: string) {
        return options.lookup(type)?.capabilities;
    }

    function getTypeTitleField(type: string): 'title' | false {
        return options.lookup(type)?.titleField ?? 'title';
    }

    function capabilityDenied(
        c: Parameters<typeof forbidden>[0],
        type: string,
        capability: string
    ): Response {
        return c.json(
            {
                error: {
                    code: 'capability_not_supported',
                    message: `Entry type "${type}" does not support capability: ${capability}`,
                    status: 409,
                },
            },
            409
        );
    }

    /**
     * Reproduce OpenAPIHono's default request-validation envelope. Body validation
     * is per-type (titled vs titleless), so it happens in the handler rather than
     * the route's static schema; titled types must still fail with the exact same
     * `{ success: false, error }` 400 they did when the route schema validated them.
     */
    function zodValidationError(
        c: Parameters<typeof forbidden>[0],
        err: z.ZodError
    ): Response {
        return c.json({ success: false, error: err }, 400);
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
            const body = await c.req.json<EntryQueryParams & Record<string, unknown>>();
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
                if (!requireEntryType(t))
                    return notFound(c, `Entry type '${t}' not found`);
                if (!can(role, options.permissionFor(t, 'read'))) return forbidden(c);
            }

            const wantsFull = parseFullFromBody(body);
            if (wantsFull && !can(role, PERMISSION_ENTRY_READ_FULL)) return forbidden(c);

            const validatedSort = validateSort(body.sort);
            const params: EntryQueryParams & { type: string | readonly string[] } = {
                ...body,
                type: types.map(options.qualify),
                full: wantsFull,
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
        if (!can(role, options.permissionFor(type, 'read'))) return forbidden(c);
        if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

        try {
            const query = c.req.query();
            const wantsFull = parseFullFromQuery(query);
            if (wantsFull && !can(role, PERMISSION_ENTRY_READ_FULL)) return forbidden(c);

            const params = {
                ...parseQueryParams(query),
                type: options.qualify(type),
                full: wantsFull,
            };
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
        if (!can(role, options.permissionFor(type, 'read'))) return forbidden(c);

        if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

        try {
            const query = c.req.query();
            const wantsFull = parseFullFromQuery(query);
            if (wantsFull && !can(role, PERMISSION_ENTRY_READ_FULL)) return forbidden(c);

            const qp = parseQueryParams(query);
            const entry = await Astromech.entries.get({
                type: options.qualify(type),
                id,
                full: wantsFull,
                ...(qp.populate ? { populate: qp.populate } : {}),
                ...(qp.locale ? { locale: qp.locale } : {}),
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

    // The route body is validated per entry type in the handler (titled vs
    // titleless). The OpenAPI registration advertises the titled schema (the
    // documented default); the handler runs the type-specific schema and emits the
    // same `{ success: false, error }` envelope OpenAPIHono's validator would, so
    // titled types behave byte-for-byte as before while titleless types are admitted.
    const createEntryRoute = createRoute({
        method: 'post',
        path: '/{type}',
        request: {
            params: z.object({ type: z.string().openapi({ example: 'post' }) }),
            body: {
                content: {
                    'application/json': { schema: createEntrySchemaFor(false) },
                },
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
        if (!can(role, options.permissionFor(type, 'create'))) return forbidden(c);

        if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

        try {
            const raw = await c.req.json();
            const parsed = createEntrySchemaFor(getTypeTitleField(type)).safeParse(raw);
            if (!parsed.success) return zodValidationError(c, parsed.error);

            const caps = getTypeCapabilities(type);

            if (
                !caps?.statuses &&
                (parsed.data.status !== undefined || parsed.data.publishAt !== undefined)
            ) {
                return capabilityDenied(c, type, 'statuses');
            }

            if (!caps?.slug && parsed.data.slug !== undefined) {
                return capabilityDenied(c, type, 'slug');
            }

            const { title, slug, fields, status, publishAt, locale, localeGroup } =
                parsed.data;

            const entry = await Astromech.entries.create({
                type: options.qualify(type),
                ...(title !== undefined && { title }),
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
        if (!can(role, options.permissionFor(type, 'read'))) return forbidden(c);

        if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

        try {
            const body = await c.req.json<Omit<EntryQueryParams, 'type'> & Record<string, unknown>>();
            const wantsFull = parseFullFromBody(body);
            if (wantsFull && !can(role, PERMISSION_ENTRY_READ_FULL)) return forbidden(c);

            const validatedSort = validateSort(body.sort);
            const params: EntryQueryParams & { type: string } = {
                ...body,
                type: options.qualify(type),
                full: wantsFull,
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
        if (!can(role, options.permissionFor(type, 'update'))) return forbidden(c);
        if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

        try {
            const raw = await c.req.json();
            const parsed = bulkUpdateSchema.safeParse(raw);
            if (!parsed.success) return fromZodError(c, parsed.error);

            const { ids, data } = parsed.data;
            const caps = getTypeCapabilities(type);

            if (
                !caps?.statuses &&
                (data.status !== undefined || data.publishAt !== undefined)
            ) {
                return capabilityDenied(c, type, 'statuses');
            }

            if (!caps?.slug && data.slug !== undefined) {
                return capabilityDenied(c, type, 'slug');
            }

            if (data.status === 'published') {
                if (!can(role, options.permissionFor(type, 'publish')))
                    return forbidden(c);
            }

            const entries = await Astromech.entries.update({
                type: options.qualify(type),
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
        if (!can(role, options.permissionFor(type, 'delete'))) return forbidden(c);
        if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

        const caps = getTypeCapabilities(type);
        if (!caps?.trash) return capabilityDenied(c, type, 'trash');

        try {
            const raw = await c.req.json();
            const parsed = bulkTrashOrDeleteSchema.safeParse(raw);
            if (!parsed.success) return fromZodError(c, parsed.error);

            await Astromech.entries.trash({
                type: options.qualify(type),
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
        if (!can(role, options.permissionFor(type, 'delete'))) return forbidden(c);
        if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

        try {
            const raw = await c.req.json();
            const parsed = bulkTrashOrDeleteSchema.safeParse(raw);
            if (!parsed.success) return fromZodError(c, parsed.error);

            await Astromech.entries.delete({
                type: options.qualify(type),
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
        if (!can(role, options.permissionFor(type, 'update'))) return forbidden(c);
        if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

        const caps = getTypeCapabilities(type);
        if (!caps?.trash) return capabilityDenied(c, type, 'trash');

        try {
            const raw = await c.req.json();
            const parsed = bulkIdsSchema.safeParse(raw);
            if (!parsed.success) return fromZodError(c, parsed.error);

            const entries = await Astromech.entries.restore({
                type: options.qualify(type),
                id: parsed.data.ids,
            });
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
        if (!can(role, options.permissionFor(type, 'publish'))) return forbidden(c);
        if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

        const caps = getTypeCapabilities(type);
        if (!caps?.statuses) return capabilityDenied(c, type, 'statuses');

        try {
            const raw = await c.req.json();
            const parsed = bulkIdsSchema.safeParse(raw);
            if (!parsed.success) return fromZodError(c, parsed.error);

            const entries = await Astromech.entries.publish({
                type: options.qualify(type),
                id: parsed.data.ids,
            });
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
        if (!can(role, options.permissionFor(type, 'publish'))) return forbidden(c);
        if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

        const caps = getTypeCapabilities(type);
        if (!caps?.statuses) return capabilityDenied(c, type, 'statuses');

        try {
            const raw = await c.req.json();
            const parsed = bulkIdsSchema.safeParse(raw);
            if (!parsed.success) return fromZodError(c, parsed.error);

            const entries = await Astromech.entries.unpublish({
                type: options.qualify(type),
                id: parsed.data.ids,
            });
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
        if (!can(role, options.permissionFor(type, 'publish'))) return forbidden(c);
        if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

        const caps = getTypeCapabilities(type);
        if (!caps?.statuses) return capabilityDenied(c, type, 'statuses');

        try {
            const raw = await c.req.json();
            const parsed = bulkScheduleSchema.safeParse(raw);
            if (!parsed.success) return fromZodError(c, parsed.error);

            const entries = await Astromech.entries.schedule({
                type: options.qualify(type),
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
        if (!can(role, options.permissionFor(type, 'update'))) return forbidden(c);

        if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

        const caps = getTypeCapabilities(type);
        if (!caps?.trash) return capabilityDenied(c, type, 'trash');

        try {
            const entry = await Astromech.entries.restore({
                type: options.qualify(type),
                id,
            });
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
        if (!can(role, options.permissionFor(type, 'create'))) return forbidden(c);

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
                type: options.qualify(type),
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
                content: {
                    'application/json': { schema: updateEntrySchemaFor(false) },
                },
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
        if (!can(role, options.permissionFor(type, 'update'))) return forbidden(c);

        if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

        try {
            const raw = await c.req.json();
            const parsed = updateEntrySchemaFor(getTypeTitleField(type)).safeParse(raw);
            if (!parsed.success) return fromZodError(c, parsed.error);

            const caps = getTypeCapabilities(type);

            if (
                !caps?.statuses &&
                (parsed.data.status !== undefined || parsed.data.publishAt !== undefined)
            ) {
                return capabilityDenied(c, type, 'statuses');
            }

            if (!caps?.slug && parsed.data.slug !== undefined) {
                return capabilityDenied(c, type, 'slug');
            }

            const { title, slug, fields, status, publishAt } = parsed.data;

            if (parsed.data.status === 'published') {
                if (!can(role, options.permissionFor(type, 'publish')))
                    return forbidden(c);
            }

            const entry = await Astromech.entries.update({
                type: options.qualify(type),
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
        if (!can(role, options.permissionFor(type, 'delete'))) return forbidden(c);

        if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

        const caps = getTypeCapabilities(type);
        if (!caps?.trash) return capabilityDenied(c, type, 'trash');

        try {
            await Astromech.entries.emptyTrash({ type: options.qualify(type) });
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
        if (!can(role, options.permissionFor(type, 'delete'))) return forbidden(c);

        if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

        try {
            await Astromech.entries.delete({
                type: options.qualify(type),
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
        if (!can(role, options.permissionFor(type, 'delete'))) return forbidden(c);

        if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

        const cascade = cascadeLocalesFromQuery(c.req.query());
        const caps = getTypeCapabilities(type);

        try {
            if (!caps?.trash) {
                // trash is off → hard delete
                await Astromech.entries.delete({
                    type: options.qualify(type),
                    id,
                    cascadeLocales: cascade,
                });
            } else {
                await Astromech.entries.trash({
                    type: options.qualify(type),
                    id,
                    cascadeLocales: cascade,
                });
            }
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
        if (!can(role, options.permissionFor(type, 'publish'))) return forbidden(c);

        if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

        const caps = getTypeCapabilities(type);
        if (!caps?.statuses) return capabilityDenied(c, type, 'statuses');

        try {
            const entry = await Astromech.entries.publish({
                type: options.qualify(type),
                id,
            });
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
        if (!can(role, options.permissionFor(type, 'publish'))) return forbidden(c);

        if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

        const caps = getTypeCapabilities(type);
        if (!caps?.statuses) return capabilityDenied(c, type, 'statuses');

        try {
            const entry = await Astromech.entries.unpublish({
                type: options.qualify(type),
                id,
            });
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
        if (!can(role, options.permissionFor(type, 'publish'))) return forbidden(c);

        if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

        const caps = getTypeCapabilities(type);
        if (!caps?.statuses) return capabilityDenied(c, type, 'statuses');

        try {
            const raw = await c.req.json();
            const parsed = scheduleEntrySchema.safeParse(raw);
            if (!parsed.success) return fromZodError(c, parsed.error);
            const entry = await Astromech.entries.schedule({
                type: options.qualify(type),
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
        if (!can(role, options.permissionFor(type, 'read'))) return forbidden(c);

        if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

        try {
            const versions = await Astromech.entries.versions({
                type: options.qualify(type),
                id,
            });
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
        if (!can(role, options.permissionFor(type, 'update'))) return forbidden(c);

        if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

        try {
            const entry = await Astromech.entries.restoreVersion({
                type: options.qualify(type),
                id,
                versionId,
            });
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
        if (!can(role, options.permissionFor(type, 'read'))) return forbidden(c);

        if (!requireEntryType(type)) return notFound(c, `Entry type '${type}' not found`);

        try {
            const relations = await Astromech.entries.incomingRelations({
                type: options.qualify(type),
                id,
            });
            return c.json({ data: relations });
        } catch (err) {
            return internalError(c, err instanceof Error ? err.message : undefined);
        }
    });

    return router;
}

/**
 * Root entries router — bare type ids, root `entry:{type}:{action}` permissions,
 * identity type transform. Byte-identical to the pre-factory behavior.
 */
export const entriesRouter = createEntriesRouter({
    lookup: (t) => Astromech.config.entries[t],
    qualify: (t) => t,
    permissionFor: (t, a) => `entry:${t}:${a}`,
});
