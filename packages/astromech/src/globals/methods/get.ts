import type { GlobalRepository, GlobalResource } from '../repository';
import type { VisibilityShape } from '@/content/visibility';
import { z } from '@hono/zod-openapi';
import { assertCapability } from '@/content/capabilities';
import { resolveResourceLocale } from '@/content/locale';
import { RESOURCE_SPECS } from '@/content/resources';
import { applyVisibility } from '@/content/visibility';
import { ResourceValidationError } from '@/errors/resource';
import { flattenEntryFields } from '@/fields/flatten';
import { defineServiceMethod } from '@/services/define-service-method';
import { readGate } from '../internal/access';
import { getDeclaredGlobal } from '../internal/global';
import { globalRepository } from '../repository';
import { globalSchema, localised } from '../schema';

/**
 * Gets one locale of one global, filtered to the caller's visibility shape.
 * Returns null when that locale has never been saved or visibility hides it —
 * there is no fallback to another locale. An undeclared key throws, since a
 * declared-but-unsaved global is already null and a typo is a caller error.
 */
export const getGlobal = defineServiceMethod({
    summary: 'Read one locale of a global. Null when it has never been saved there.',
    input: localised.extend({
        full: z.boolean().optional(),
        staged: z.boolean().optional(),
    }),
    output: globalSchema.nullable(),
    access: readGate,
    mutates: false,
    async handler(params, ctx): Promise<GlobalResource | null> {
        const global = getDeclaredGlobal(ctx.config, params.key);
        const locale = resolveResourceLocale(
            RESOURCE_SPECS.global,
            ctx.config,
            global.id,
            params.locale
        );

        // Before the row lookup, so every caller gets the capability's 409 for
        // `staged` whether or not the global has been saved.
        if (params.staged === true) assertCapability('global', global, 'staging');

        // A staged change is never published, so a public read of one would
        // answer null for every global; asking for it in the public shape is a
        // mistake worth naming rather than an empty result.
        if (params.staged === true && params.full !== true) {
            throw new ResourceValidationError([
                `${ctx.method.name}: \`staged\` requires \`full\`; a staged change is ` +
                    'never part of the public read.',
            ]);
        }

        const row =
            params.staged === true
                ? await findStaged(globalRepository, params.key, locale)
                : await globalRepository.findByKey(params.key, locale);
        if (!row) return null;

        const shape: VisibilityShape = params.full ? 'full' : 'public';

        const filtered = applyVisibility(
            {
                fields: row.fields,
                // A global with `statuses: false` has no draft state — every row
                // is live — so the publish gate does not apply to it. Its column
                // still reads `unpublished`, which would otherwise hide it from
                // every public read.
                ...(global.capabilities.statuses
                    ? { status: row.status, publishedAt: row.publishedAt }
                    : {}),
            },
            {
                shape,
                fields: flattenEntryFields(global.fields),
                audience: { now: new Date() },
            }
        );
        if (filtered === null) return null;

        return { ...row, fields: filtered.fields };
    },
});

/** The staged change for one locale of the global saved under `key`, or null. */
async function findStaged(
    repository: GlobalRepository,
    key: string,
    locale: string
): Promise<GlobalResource | null> {
    const id = await repository.findIdByKey(key);
    return id === null ? null : repository.staging.findOne({ id, locale });
}
