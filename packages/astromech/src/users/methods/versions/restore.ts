import type { UserResource } from '../../repository';
import { z } from '@hono/zod-openapi';
import { getResourceInLocale } from '@/content/locale';
import { restoreVersion } from '@/content/versions';
import { defineServiceMethod } from '@/services/define-service-method';
import { syncUserRelationships } from '../../relationships';
import { userRepository } from '../../repository';
import { userSchema } from '../../schema';

/**
 * Saves the fields it overwrites as a new version first, so a restore can be
 * undone. A locale with no content row, or no version with that number, throws.
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

        const current = await getResourceInLocale('user', config, userRepository, params);

        return restoreVersion({
            resource: 'user',
            repository: userRepository,
            current,
            version,
            address: { id },
            user,
            guard: { contentId: current.contentId },
            write: async ({ fields }, guard) => {
                const restored = await userRepository.update(
                    { id, locale: current.locale },
                    { fields, updatedBy: userId },
                    guard
                );
                if (restored === null) return null;
                await syncUserRelationships(config, id);
                return restored;
            },
        });
    },
});
