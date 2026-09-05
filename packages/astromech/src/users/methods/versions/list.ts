import type { JsonObject, UserVersion } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { defineServiceMethod } from '@/services/define-service-method';
import { UserNotFoundError } from '../../errors';
import { resolveUserLocale, userRepository } from '../../internal/locale';

/**
 * Lists the saved versions of one locale of a user's fields, newest first.
 * Unlike a read, this addresses a content row: a locale with none throws rather
 * than falling back to the default.
 */
export const listUserVersions = defineServiceMethod({
    summary: 'List the saved versions of one locale of a user’s fields.',
    input: z.object({ id: z.string(), locale: z.string().optional() }),
    access: 'users:read',
    mutates: false,
    async handler(params: { id: string; locale?: string }, ctx): Promise<UserVersion[]> {
        const locale = resolveUserLocale(ctx.config, params.locale);
        const repository = userRepository(ctx.config);
        const current = await repository.getExact(params.id, locale);
        if (!current) throw new UserNotFoundError({ id: params.id, locale });

        const rows = await repository.versions.list(current.contentId);
        return rows.map((row) => ({
            id: row.id,
            // A version row names the content row it snapshots, so the user and
            // locale come from the record it was read for.
            userId: params.id,
            locale: current.locale,
            version: row.version,
            fields: (row.fields ?? null) as JsonObject | null,
            createdAt: row.createdAt,
            createdBy: row.createdBy,
        }));
    },
});
