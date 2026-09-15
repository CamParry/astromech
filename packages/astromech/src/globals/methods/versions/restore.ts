import type { Global, JsonObject } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { snapshotVersion } from '@/content/versions';
import { transaction } from '@/database/transaction';
import { defineServiceMethod } from '@/services/define-service-method';
import { GlobalNotFoundError } from '../../errors';
import { gate } from '../../internal/access';
import { asGlobal, requireCanonical } from '../../internal/global';
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
        const { repository, id, locale, current } = await requireCanonical(ctx.config, {
            key: params.key,
            locale: params.locale,
            capability: 'versioning',
        });

        const version = await repository.versions.get(params.versionId);
        if (!version || version.contentId !== current.contentId) {
            throw new GlobalNotFoundError({ key: params.key, locale });
        }
        const restoredFields = ((version.fields as JsonObject | null) ??
            current.fields) as JsonObject;

        const updated = await transaction(async () => {
            await snapshotVersion(repository.versions, current, ctx.user);
            return repository.update({ id, locale }, { fields: restoredFields });
        });

        return asGlobal(updated);
    },
});
