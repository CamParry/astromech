import type { userSnapshotSchema } from '../../schema';
import { z } from '@hono/zod-openapi';
import { RESOURCE_SPECS } from '@/content/resources';
import { readVersion } from '@/content/versions';
import { defineServiceMethod } from '@/services/define-service-method';
import { getUserInLocale } from '../../internal/versions';
import { userRepository } from '../../repository';
import { userVersionSchema } from '../../schema';

/**
 * Reads one saved version of one locale of a user's fields, by its number: the
 * metadata and the fields it holds. A locale with no content row, or no version
 * with that number, throws.
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
    async handler(params, ctx) {
        const current = await getUserInLocale(ctx.config, params);
        return readVersion<z.input<typeof userSnapshotSchema>>({
            spec: RESOURCE_SPECS.user,
            versions: userRepository.versions,
            record: current,
            version: params.version,
            address: { id: params.id },
        });
    },
});
