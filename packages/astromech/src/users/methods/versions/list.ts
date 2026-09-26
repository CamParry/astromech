import type { VersionMetadata } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { versionMetadataSchema } from '@/content/schema';
import { listVersions } from '@/content/versions';
import { defineServiceMethod } from '@/services/define-service-method';
import { getUserInLocale } from '../../internal/versions';
import { userRepository } from '../../repository';

/**
 * Lists the saved versions of one locale of a user's fields, newest first, as their
 * metadata; `getVersion` reads one's content. Unlike a read, this addresses a
 * content row: a locale with none throws rather than falling back to the default.
 */
export const listUserVersions = defineServiceMethod({
    summary: 'List the saved versions of one locale of a user’s fields.',
    input: z.object({ id: z.string(), locale: z.string().optional() }),
    output: z.array(versionMetadataSchema),
    access: 'users:read',
    mutates: false,
    async handler(params, ctx): Promise<VersionMetadata[]> {
        const current = await getUserInLocale(ctx.config, params);
        return listVersions(userRepository.versions, current);
    },
});
