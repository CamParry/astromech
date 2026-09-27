import type { VersionMetadata } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { getResourceInLocale } from '@/content/locale';
import { versionMetadataSchema } from '@/content/schema';
import { listVersions } from '@/content/versions';
import { defineServiceMethod } from '@/services/define-service-method';
import { userRepository } from '../../repository';

/**
 * Newest first, as metadata; `getVersion` reads one's fields. A locale with no
 * content row throws, with no fallback to the default locale.
 */
export const listUserVersions = defineServiceMethod({
    summary: 'List the saved versions of one locale of a user’s fields.',
    input: z.strictObject({ id: z.string(), locale: z.string().optional() }),
    output: z.array(versionMetadataSchema),
    access: 'users:read',
    mutates: false,
    async handler(params, ctx): Promise<VersionMetadata[]> {
        const { config } = ctx;

        const current = await getResourceInLocale('user', config, userRepository, params);

        return listVersions(userRepository.versions, current);
    },
});
