import type { VisibilityShape } from '@/content/visibility';
import type { Global } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { assertCapability } from '@/content/capabilities';
import { resolveResourceLocale } from '@/content/locale';
import { RESOURCE_SPECS } from '@/content/resources';
import { applyVisibility } from '@/content/visibility';
import { ResourceValidationError } from '@/errors/resource';
import { flattenEntryFields } from '@/fields/flatten';
import { defineServiceMethod } from '@/services/define-service-method';
import { readGate } from '../internal/access';
import { asGlobal, globalRepository, resolveGlobal } from '../internal/global';
import { localised } from '../schema';

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
    access: readGate,
    mutates: false,
    async handler(params, ctx): Promise<Global | null> {
        const global = resolveGlobal(ctx.config, params.key);
        const locale = resolveResourceLocale(
            RESOURCE_SPECS.global,
            ctx.config,
            global.id,
            params.locale
        );

        // A staged change is never published, so a public read of one would
        // answer null for every global; asking for it in the public shape is a
        // mistake worth naming rather than an empty result.
        if (params.staged === true && params.full !== true) {
            throw new ResourceValidationError([
                `${ctx.method.name}: \`staged\` requires \`full\`; a staged change is ` +
                    'never part of the public read.',
            ]);
        }

        const repository = globalRepository(ctx.config);
        const id = await repository.idByKey(params.key);
        if (id === null) return null;

        if (params.staged === true) assertCapability('global', global, 'staging');
        const row =
            params.staged === true
                ? await repository.staging.getByCanonical(id, locale)
                : await repository.get({ id, locale });
        if (!row) return null;

        const record = asGlobal(row);
        const shape: VisibilityShape = params.full ? 'full' : 'public';

        const filtered = applyVisibility(
            {
                fields: record.fields,
                // A global with `statuses: false` has no draft state — every row
                // is live — so the publish gate does not apply to it. Its column
                // still reads `unpublished`, which would otherwise hide it from
                // every public read.
                ...(global.capabilities.statuses
                    ? { status: record.status, publishedAt: record.publishedAt }
                    : {}),
            },
            {
                shape,
                fields: flattenEntryFields(global.fields),
                audience: { role: ctx.user?.role ?? null, now: new Date() },
            }
        );
        if (filtered === null) return null;

        const result: Global = { ...record, fields: filtered.fields };
        return result;
    },
});
