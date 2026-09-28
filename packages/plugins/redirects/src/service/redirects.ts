/**
 * The redirects service: the public `lookup` a frontend middleware calls, and
 * the `list`, `get`, `create`, `update` and `delete` behind the admin resource.
 */

import type { RedirectsRepository } from '../repository';
import type { NewRedirectRow, RedirectRow } from '../tables/redirects';
import type { RedirectMatch } from '../types';
import type { PluginContext, QueryResult } from 'astromech';
import { defineServiceMethod, queryResultSchema, z } from 'astromech';
import { parseFields } from 'astromech/fields';
import { redirectFields } from '../fields';
import { createRedirectsRepository, REDIRECT_SORTABLE } from '../repository';

/** What `lookup` answers for a path with an enabled rule. */
export const redirectMatchSchema = z.object({
    to: z.string(),
    status: z.enum(['301', '302']),
});

/**
 * A stored rule, as the admin methods answer it. `status` is the stored text,
 * which `lookup` reads as a 301 unless it is `'302'`.
 */
export const redirectSchema = z.object({
    id: z.string(),
    from: z.string(),
    to: z.string(),
    status: z.string(),
    enabled: z.boolean(),
    createdAt: z.date(),
    updatedAt: z.date(),
});

export const redirectsService = {
    /**
     * Public, so a frontend middleware can call it without a session. A path
     * with no rule, or only a disabled one, answers `null`.
     */
    lookup: defineServiceMethod({
        summary: 'Look up the redirect target for an incoming path.',
        input: z.strictObject({ from: z.string() }),
        output: redirectMatchSchema.nullable(),
        access: 'public',
        mutates: false,
        async handler(params, ctx): Promise<RedirectMatch | null> {
            const { from } = params;
            const redirects = createRedirectsRepository(ctx.db);

            if (from === '') return null;
            const rule = await redirects.findByFrom(from);
            if (rule === null || !rule.enabled) return null;

            return { to: rule.to, status: rule.status === '302' ? '302' : '301' };
        },
    }),

    list: defineServiceMethod({
        summary: 'List redirect rules, searched by path, sorted and paged.',
        input: z.strictObject({
            search: z.string().optional(),
            sort: z
                .record(z.string(), z.enum(['asc', 'desc']))
                .refine(
                    (sort) =>
                        Object.keys(sort).every((key) =>
                            (REDIRECT_SORTABLE as readonly string[]).includes(key)
                        ),
                    { message: `Sort by one of: ${REDIRECT_SORTABLE.join(', ')}` }
                )
                .optional(),
            page: z.number().int().min(1).default(1),
            limit: z.number().int().min(1).max(100).default(20),
        }),
        output: queryResultSchema(redirectSchema),
        access: { permission: 'read' },
        mutates: false,
        async handler(params, ctx): Promise<QueryResult<RedirectRow>> {
            const { search, sort, page, limit } = params;
            const redirects = createRedirectsRepository(ctx.db);
            const offset = (page - 1) * limit;

            const [data, total] = await Promise.all([
                redirects.findMany({ search, sort, limit, offset }),
                redirects.count({ search }),
            ]);

            return {
                data,
                pagination: { page, limit, total, pages: Math.ceil(total / limit) },
            };
        },
    }),

    get: defineServiceMethod({
        summary: 'Get one redirect rule by id.',
        input: z.strictObject({ id: z.string() }),
        output: redirectSchema.nullable(),
        access: { permission: 'read' },
        mutates: false,
        async handler(params, ctx): Promise<RedirectRow | null> {
            const { id } = params;
            const redirects = createRedirectsRepository(ctx.db);

            return redirects.findOne(id);
        },
    }),

    create: defineServiceMethod({
        summary: 'Create a redirect rule.',
        input: z.strictObject({ data: z.record(z.string(), z.unknown()) }),
        output: redirectSchema,
        access: { permission: 'create' },
        mutates: true,
        async handler(params, ctx): Promise<RedirectRow> {
            const { data } = params;
            const redirects = createRedirectsRepository(ctx.db);

            const values = await parseRedirect(ctx, redirects, data, null);

            return redirects.create(values);
        },
    }),

    /** A rule that does not exist answers `null`. */
    update: defineServiceMethod({
        summary: 'Update a redirect rule. Fields left out keep their values.',
        input: z.strictObject({
            id: z.string(),
            data: z.record(z.string(), z.unknown()),
        }),
        output: redirectSchema.nullable(),
        access: { permission: 'update' },
        mutates: true,
        idempotent: true,
        async handler(params, ctx): Promise<RedirectRow | null> {
            const { id, data } = params;
            const redirects = createRedirectsRepository(ctx.db);

            const existing = await redirects.findOne(id);
            if (existing === null) return null;

            const merged = { ...existing, ...data };
            const values = await parseRedirect(ctx, redirects, merged, existing);

            return redirects.update(id, values);
        },
    }),

    /** A rule that does not exist answers `{ deleted: false }`. */
    delete: defineServiceMethod({
        summary: 'Delete a redirect rule.',
        input: z.strictObject({ id: z.string() }),
        output: z.object({ deleted: z.boolean() }),
        access: { permission: 'delete' },
        mutates: true,
        destructive: true,
        idempotent: true,
        async handler(params, ctx): Promise<{ deleted: boolean }> {
            const { id } = params;
            const redirects = createRedirectsRepository(ctx.db);

            const deleted = await redirects.delete(id);

            return { deleted };
        },
    }),
};

/**
 * Check a rule's values against `redirectFields`, throwing a 422 with the
 * failures by field. `existing` is the rule an update writes to, which may keep
 * its own `from`.
 */
async function parseRedirect(
    ctx: PluginContext,
    redirects: RedirectsRepository,
    data: Record<string, unknown>,
    existing: RedirectRow | null
): Promise<NewRedirectRow> {
    const values = await parseFields(data, redirectFields, {
        operation: existing === null ? 'create' : 'update',
        resource: { kind: 'plugin', record: existing },
        user: ctx.user,
        isUnique: async (field, value) => {
            if (field.name !== 'from' || typeof value !== 'string') return true;
            const holder = await redirects.findByFrom(value);
            return holder === null || holder.id === existing?.id;
        },
    });
    return {
        from: typeof values['from'] === 'string' ? values['from'] : '',
        to: typeof values['to'] === 'string' ? values['to'] : '',
        status: values['status'] === '302' ? '302' : '301',
        enabled: values['enabled'] !== false,
    };
}
