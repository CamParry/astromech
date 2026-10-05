import type { GlobalResource } from '../repository';
import type { VisibilityShape } from '@/content/visibility';
import { z } from '@hono/zod-openapi';
import { assertCapability } from '@/content/capabilities';
import { resolveResourceLocale } from '@/content/locale';
import { applyVisibility } from '@/content/visibility';
import { ResourceValidationError } from '@/errors/resource';
import { flattenEntryFields } from '@/fields/flatten';
import { defineServiceMethod } from '@/services/define-service-method';
import { globalGetAccess } from '../internal/access';
import { globalRepository } from '../repository';
import { getDeclaredGlobal } from '../resolve-global';
import { globalSchema, localised } from '../schema';

/**
 * Filtered to the caller's visibility shape, and null when that hides it; there
 * is no fallback to another locale. An undeclared key throws. `staged` reads the
 * staged change, and needs `full`.
 */
export const getGlobal = defineServiceMethod({
    summary: 'Read one locale of a global. Null when it has never been saved there.',
    input: localised.extend({
        full: z.boolean().optional(),
        staged: z.boolean().optional(),
    }),
    output: globalSchema.nullable(),
    access: globalGetAccess,
    mutates: false,
    async handler(params, ctx): Promise<GlobalResource | null> {
        const { key, full, staged } = params;
        const { config } = ctx;
        const global = getDeclaredGlobal(config, key);
        const locale = resolveResourceLocale('global', config, global.id, params.locale);
        const shape: VisibilityShape = full ? 'full' : 'public';

        // Checked before the read, so an unsaved global gets the same errors.
        if (staged === true) assertCapability('global', global, 'staging');
        if (staged === true && full !== true) {
            throw new ResourceValidationError([
                `${ctx.method.name}: \`staged\` requires \`full\`; a staged change is ` +
                    'never part of the public read.',
            ]);
        }
        const current =
            staged === true
                ? await findStaged(key, locale)
                : await globalRepository.findByKey(key, locale);
        if (!current) return null;

        const visible = applyVisibility(
            {
                fields: current.fields,
                status: current.status,
                publishedAt: current.publishedAt,
            },
            {
                shape,
                fields: flattenEntryFields(global.fields),
                statuses: global.capabilities.statuses,
                audience: { now: new Date() },
            }
        );
        if (visible === null) return null;

        return { ...current, fields: visible.fields };
    },
});

/** The staged change for one locale of the global saved under `key`, or null. */
async function findStaged(key: string, locale: string): Promise<GlobalResource | null> {
    const id = await globalRepository.findIdByKey(key);
    return id === null ? null : globalRepository.staging.findOne({ id, locale });
}
