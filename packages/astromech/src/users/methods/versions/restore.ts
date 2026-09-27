import type { UserResource } from '../../repository';
import { z } from '@hono/zod-openapi';
import { getResourceInLocale } from '@/content/locale';
import { RESOURCE_SPECS } from '@/content/resources';
import { restoreVersion } from '@/content/versions';
import { defineServiceMethod } from '@/services/define-service-method';
import { syncUserRelationships } from '../../relationships';
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
    input: z.strictObject({
        id: z.string(),
        locale: z.string().optional(),
        version: z.number().int(),
    }),
    output: userSchema,
    access: 'users:update',
    mutates: true,
    async handler(params, ctx): Promise<UserResource> {
        const { id, version } = params;
        const { config, user } = ctx;
        const userId = user?.id ?? null;
        const current = await getResourceInLocale(
            RESOURCE_SPECS.user,
            config,
            userRepository,
            params
        );
        const { locale } = current;

        return restoreVersion({
            spec: RESOURCE_SPECS.user,
            versions: userRepository.versions,
            current,
            version,
            address: { id },
            user,
            write: async ({ fields }) => {
                const row = await userRepository.update(
                    { id, locale },
                    { fields, updatedBy: userId }
                );
                await syncUserRelationships(config, id);
                return row;
            },
        });
    },
});
