import type { UserResource } from '../../repository';
import { z } from '@hono/zod-openapi';
import { RESOURCE_SPECS } from '@/content/resources';
import { restoreVersion } from '@/content/versions';
import { defineServiceMethod } from '@/services/define-service-method';
import { syncUserRelationships } from '../../internal/relationships';
import { getUserInLocale } from '../../internal/versions';
import { userRepository } from '../../repository';
import { userSchema } from '../../schema';

/**
 * Restores one locale of a user's fields to one of its saved versions, by its
 * number, snapshotting the state being overwritten first so a restore is itself
 * reversible. A locale with no content row, or no version with that number,
 * throws.
 */
export const restoreUserVersion = defineServiceMethod({
    summary: 'Restore one locale of a user’s fields to a saved version.',
    input: z.object({
        id: z.string(),
        locale: z.string().optional(),
        version: z.number().int(),
    }),
    output: userSchema,
    access: 'users:update',
    mutates: true,
    async handler(params, ctx): Promise<UserResource> {
        const { id } = params;
        const current = await getUserInLocale(ctx.config, params);
        const { locale } = current;

        return restoreVersion({
            spec: RESOURCE_SPECS.user,
            versions: userRepository.versions,
            current,
            version: params.version,
            address: { id },
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
