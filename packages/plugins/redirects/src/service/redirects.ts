/**
 * The plugin's service: the public `lookup` a frontend middleware calls, and
 * the `list`, `get`, `create`, `update` and `delete` methods behind the admin
 * resource, each gated on one of the plugin's permissions.
 */

import type { RedirectsRepository } from '../repository';
import type { NewRedirectRow, RedirectRow } from '../tables/redirects';
import type { RedirectMatch } from '../types';
import type { PluginContext, QueryResult } from 'astromech';
import { defineServiceMethod, z } from 'astromech';
import { parseFields } from 'astromech/fields';
import { redirectFields } from '../fields';
import { createRedirectsRepository, REDIRECT_SORTABLE } from '../repository';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const idInput = z.object({ id: z.string() });
const dataInput = z.record(z.string(), z.unknown());

export const redirectsService = {
    /**
     * Resolve a request path to its redirect target. Public so a frontend
     * middleware can call it without a session.
     */
    lookup: defineServiceMethod({
        access: 'public',
        summary: 'Look up the redirect target for an incoming path.',
        input: z.object({ from: z.string() }),
        mutates: false,
        handler: async ({ from }, ctx): Promise<RedirectMatch | null> => {
            if (from === '') return null;
            const rule = await createRedirectsRepository(ctx.db).findByFrom(from);
            if (rule === null || !rule.enabled) return null;
            return { to: rule.to, status: rule.status === '302' ? '302' : '301' };
        },
    }),

    list: defineServiceMethod({
        access: { permission: 'read' },
        summary: 'List redirect rules, searched by path, sorted and paged.',
        input: z.object({
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
            limit: z.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
        }),
        mutates: false,
        handler: async (
            { search, sort, page, limit },
            ctx
        ): Promise<QueryResult<RedirectRow>> => {
            const redirects = createRedirectsRepository(ctx.db);
            const [data, total] = await Promise.all([
                redirects.findMany({ search, sort, limit, offset: (page - 1) * limit }),
                redirects.count({ search }),
            ]);
            return {
                data,
                pagination: { page, limit, total, pages: Math.ceil(total / limit) },
            };
        },
    }),

    get: defineServiceMethod({
        access: { permission: 'read' },
        summary: 'Get one redirect rule by id.',
        input: idInput,
        mutates: false,
        handler: async ({ id }, ctx): Promise<RedirectRow | null> =>
            createRedirectsRepository(ctx.db).findOne(id),
    }),

    create: defineServiceMethod({
        access: { permission: 'create' },
        summary: 'Create a redirect rule.',
        input: z.object({ data: dataInput }),
        mutates: true,
        handler: async ({ data }, ctx): Promise<RedirectRow> => {
            const redirects = createRedirectsRepository(ctx.db);
            const values = await parseRedirect(ctx, redirects, data, null);
            return redirects.create(values);
        },
    }),

    /** Answers `null` when there is no rule with that id. */
    update: defineServiceMethod({
        access: { permission: 'update' },
        summary: 'Update a redirect rule. Fields left out keep their values.',
        input: z.object({ id: z.string(), data: dataInput }),
        mutates: true,
        handler: async ({ id, data }, ctx): Promise<RedirectRow | null> => {
            const redirects = createRedirectsRepository(ctx.db);
            const existing = await redirects.findOne(id);
            if (existing === null) return null;
            const values = await parseRedirect(
                ctx,
                redirects,
                { ...existing, ...data },
                existing
            );
            return redirects.update(id, values);
        },
    }),

    delete: defineServiceMethod({
        access: { permission: 'delete' },
        summary: 'Delete a redirect rule.',
        input: idInput,
        mutates: true,
        destructive: true,
        handler: async ({ id }, ctx): Promise<{ deleted: boolean }> => ({
            deleted: await createRedirectsRepository(ctx.db).delete(id),
        }),
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
