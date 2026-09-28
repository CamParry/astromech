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
import { entrySchema } from '../schema';

/**
 * Gets one locale of one entry, filtered to the caller's visibility shape.
 * Returns null when that locale has no row, its type differs, or visibility
 * hides it — there is no fallback to another locale. A `previewToken` takes the
 * token-authorized preview path that skips the publish gate, and is what
 * `staged` requires: without one it is a validation error.
 */
export const getEntry = defineServiceMethod({
    summary: 'Read an entry.',
    input: getEntryInput({ type: z.string() }),
    output: entrySchema.nullable(),
    access: entryAccess('read'),
    mutates: false,
    async handler(params, ctx): Promise<EntryResource | null> {
        const { type, id, locale, full, previewToken, staged } = params;
        const { config } = ctx;

        // Preview (forward versioning): token-authorized, publish-gate-bypassed.
        if (previewToken) return getPreviewEntry(config, params);

        // Without a token there is no staged read here: answering the canonical row
        // for `staged: true` would silently hand back the wrong content.
        if (staged === true) {
            throw ValidationError.fromFieldErrors({}, [
                `${ctx.method.name}: \`staged\` requires \`previewToken\`; use ` +
                    '`getStaged` to read a staged change without one.',
            ]);
        }

        const record = await entryRepository.findOne({ type, id, locale });

        if (!record) return null;

        const shape: VisibilityShape = full ? 'full' : 'public';
        const audience = { now: new Date() };
        const entryType = resolveEntryType(config, type);
        const fields = entryType ? flattenEntryFields(entryType.fields) : [];

        return applyVisibility(record, { shape, fields, audience });
    },
});

/**
 * `entries.get`'s input, with `type` as given: any type id on the method, one
 * type's literal in that type's catalogue.
 */
export function getEntryInput<T extends z.ZodType>({ type }: { type: T }) {
    return z.strictObject({
        type,
        id: z.string(),
        locale: z.string().optional(),
        full: z.boolean().optional(),
        previewToken: z.string().optional(),
        staged: z.boolean().optional(),
    });
}
