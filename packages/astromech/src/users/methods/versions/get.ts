import type { UserVersion } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { getResourceInLocale } from '@/content/locale';
import { readVersion } from '@/content/versions';
import { defineServiceMethod } from '@/services/define-service-method';
import { userRepository } from '../../repository';
import { userVersionSchema } from '../../schema';

/**
 * Addressed by version number. A locale with no content row, or no version with
 * that number, throws, with no fallback to the default locale.
 */
export const getUserVersion = defineServiceMethod({
    summary: 'Read one saved version of one locale of a user’s fields.',
    input: z.strictObject({
        id: z.string(),
        locale: z.string().optional(),
        version: z.number().int(),
    }),
    output: userVersionSchema,
    access: 'users:read',
    mutates: false,
    async handler(params, ctx): Promise<UserVersion> {
        const { id, version } = params;
        const { config } = ctx;

        const current = await getResourceInLocale('user', config, userRepository, params);

        return readVersion({
            resource: 'user',
            versions: userRepository.versions,
            record: current,
            version,
            address: { id },
        });
    },
});
