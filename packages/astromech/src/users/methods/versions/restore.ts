import type { UserResource } from '../../repository';
import { z } from '@hono/zod-openapi';
import { resolveResourceLocale } from '@/content/locale';
import { RESOURCE_SPECS } from '@/content/resources';
import { restoreVersion } from '@/content/versions';
import { ResourceNotFoundError } from '@/errors/resource';
import { defineServiceMethod } from '@/services/define-service-method';
import { syncUserRelationships } from '../../internal/relationships';
import { userRepository } from '../../repository';
import { userSchema } from '../../schema';

/**
 * Restores one locale of a user's fields to one of its saved versions,
 * snapshotting the state being overwritten first so a restore is itself
 * reversible. A version belonging to another locale is not found, not a
 * different row to write.
 */
export const restoreUserVersion = defineServiceMethod({
    summary: 'Restore one locale of a user’s fields to a saved version.',
    input: z.object({
        id: z.string(),
        locale: z.string().optional(),
        versionId: z.string(),
    }),
    output: userSchema,
    access: 'users:update',
    mutates: true,
    async handler(params, ctx): Promise<UserResource> {
        const { id } = params;
        const locale = resolveResourceLocale(
            RESOURCE_SPECS.user,
            ctx.config,
            undefined,
            params.locale
        );
        const current = await userRepository.findOne(id, { locale });
        if (!current) throw new ResourceNotFoundError('user', { id, locale });

        return restoreVersion({
            spec: RESOURCE_SPECS.user,
            versions: userRepository.versions,
            current,
            versionId: params.versionId,
            address: { id, locale },
            user: ctx.user,
            write: async ({ fields }) => {
                const row = await userRepository.update(
                    { id, locale },
                    { fields, updatedBy: ctx.user?.id ?? null }
                );
                await syncUserRelationships(ctx.config, id);
                return row;
            },
        });
    },
});
