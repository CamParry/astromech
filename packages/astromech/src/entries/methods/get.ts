import type { EntryResource } from '../repository/types';
import type { VisibilityShape } from '@/content/visibility';
import { z } from '@hono/zod-openapi';
import { applyVisibility } from '@/content/visibility';
import { resolveEntryType } from '@/entries/entry-types';
import { ValidationError } from '@/errors/validation';
import { flattenEntryFields } from '@/fields/flatten';
import { defineServiceMethod } from '@/services/define-service-method';
import { entryAccess } from '../internal/access';
import { getPreviewEntry } from '../internal/preview';
import { entryRepository } from '../repository/entries-table';
import { entryReadKeys, entrySchema } from '../schema';

/**
 * Filtered to the caller's visibility shape, and null when that hides it or the
 * locale has no row of this type; there is no fallback to another locale. A
 * `previewToken` reads past the publish gate, and no cache may store the
 * response to the request it serves; `staged` needs one.
 */
export const getEntry = defineServiceMethod({
    summary: 'Read an entry.',
    input: z.strictObject({
        type: z.string(),
        id: z.string(),
        ...entryReadKeys,
    }),
    output: entrySchema.nullable(),
    access: entryAccess('read'),
    mutates: false,
    async handler(params, ctx): Promise<EntryResource | null> {
        const { type, id, full, previewToken, staged } = params;
        const { config } = ctx;
        const shape: VisibilityShape = full ? 'full' : 'public';

        if (previewToken) {
            ctx.noStore();
            return getPreviewEntry(config, params);
        }
        // Answering the canonical row here would hand back the wrong content.
        if (staged === true) {
            throw ValidationError.fromFieldErrors({}, [
                `${ctx.method.name}: \`staged\` requires \`previewToken\`; use ` +
                    '`getStaged` to read a staged change without one.',
            ]);
        }

        const record = await entryRepository.findOne({ type, id, locale: params.locale });
        if (!record) return null;

        const entryType = resolveEntryType(config, type);
        const fields = entryType ? flattenEntryFields(entryType.fields) : [];

        return applyVisibility(record, { shape, fields, audience: { now: new Date() } });
    },
});
