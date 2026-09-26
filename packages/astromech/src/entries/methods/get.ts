import type { EntryResource } from '../repository/types';
import type { VisibilityShape } from '@/content/visibility';
import { z } from '@hono/zod-openapi';
import { applyVisibility } from '@/content/visibility';
import { resolveEntryType } from '@/entries/entry-types';
import { ValidationError } from '@/errors/validation';
import { flattenEntryFields } from '@/fields/flatten';
import { defineServiceMethod } from '@/services/define-service-method';
import { entryGate } from '../internal/access';
import { getPreviewEntry } from '../internal/preview-read';
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
    input: z.object({
        type: z.string(),
        id: z.string(),
        locale: z.string().optional(),
        full: z.boolean().optional(),
        previewToken: z.string().optional(),
        staged: z.boolean().optional(),
    }),
    output: entrySchema.nullable(),
    access: entryGate('read'),
    mutates: false,
    async handler(params, ctx): Promise<EntryResource | null> {
        const { type, id } = params;

        // Preview (forward versioning): token-authorized, publish-gate-bypassed.
        if (params.previewToken) return getPreviewEntry(ctx.config, params);

        // Without a token there is no staged read here: answering the canonical row
        // for `staged: true` would silently hand back the wrong content.
        if (params.staged === true) {
            throw ValidationError.fromFieldErrors({}, [
                `${ctx.method.name}: \`staged\` requires \`previewToken\`; use ` +
                    '`getStaged` to read a staged change without one.',
            ]);
        }

        const record = await entryRepository.findOne({
            type,
            id,
            locale: params.locale,
        });

        if (!record) return null;

        const shape: VisibilityShape = params.full ? 'full' : 'public';
        const audience = { now: new Date() };
        const entryType = resolveEntryType(ctx.config, type);
        const fields = entryType ? flattenEntryFields(entryType.fields) : [];

        return applyVisibility(record, { shape, fields, audience });
    },
});
