import type { VisibilityShape } from '@/content/visibility';
import type { Entry } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { defaultContentLocale } from '@/config/content-locale';
import { applyVisibility } from '@/content/visibility';
import { resolveEntryType } from '@/entries/entry-types.shared';
import { ValidationError } from '@/errors/validation';
import { flattenEntryFields } from '@/fields/flatten';
import { defineServiceMethod } from '@/services/define-service-method';
import { entryGate } from '../internal/access';
import { getPreviewEntry } from '../internal/preview-read';
import { asEntry } from '../internal/records';
import { getEntryRepository } from '../repository/registry';

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
    access: entryGate('read'),
    mutates: false,
    async handler(params, ctx): Promise<Entry | null> {
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

        const repository = getEntryRepository(type);
        const record = await repository.get({
            id,
            locale: params.locale ?? defaultContentLocale(ctx.config),
        });

        if (!record) return null;
        if (record.type !== undefined && record.type !== type) return null;

        const result = asEntry(record);
        // tableRepository-backed records carry no `type` column — stamp it so the
        // returned entry is complete.
        if (result.type === undefined) result.type = type;

        const shape: VisibilityShape = params.full ? 'full' : 'public';
        const audience = { role: ctx.user?.role ?? null, now: new Date() };
        const entryType = resolveEntryType(ctx.config, type);
        const fields = entryType ? flattenEntryFields(entryType.fields) : [];

        return applyVisibility(result, { shape, fields, audience });
    },
});
