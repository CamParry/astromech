import type { Global } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { RESOURCE_SPECS } from '@/content/resources';
import { restoreVersion } from '@/content/versions';
import { defineServiceMethod } from '@/services/define-service-method';
import { gate } from '../../internal/access';
import { getCanonicalGlobal, toGlobal } from '../../internal/global';
import { syncGlobalRelationships } from '../../internal/relationships';
import { localised } from '../../schema';

/**
 * Restores one locale of a global to one of its saved versions, snapshotting the
 * state being overwritten first so a restore is itself reversible. Throws when
 * the version does not exist or belongs to another locale.
 */
export const restoreGlobalVersion = defineServiceMethod({
    summary: 'Roll a global back to an earlier version.',
    input: localised.extend({ versionId: z.string() }),
    access: gate('update'),
    requires: 'versioning',
    mutates: true,
    idempotent: true,
    async handler(params, ctx): Promise<Global> {
        const { repository, id, locale, current } = await getCanonicalGlobal(ctx.config, {
            key: params.key,
            locale: params.locale,
        });
        return restoreVersion({
            spec: RESOURCE_SPECS.global,
            versions: repository.versions,
            current,
            versionId: params.versionId,
            address: { id: params.key, locale },
            user: ctx.user,
            write: async ({ fields }) => {
                const row = await repository.update(
                    { id, locale },
                    { fields, updatedBy: ctx.user?.id ?? null }
                );
                await syncGlobalRelationships(ctx.config, id);
                return toGlobal(row);
            },
        });
    },
});
