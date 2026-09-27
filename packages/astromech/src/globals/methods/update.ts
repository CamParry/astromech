import type { GlobalResource } from '../repository';
import { z } from '@hono/zod-openapi';
import { defineServiceMethod } from '@/services/define-service-method';
import { globalAccess } from '../internal/access';
import { updateGlobalLocale } from '../internal/update-global';
import { globalSchema, localised, updateGlobalSchema } from '../schema';

/**
 * Writes one locale of one global, firing the global write hooks around it.
 * Rows are created on demand: a global nothing has saved gets its `globals` row
 * and this locale's content row, and a translatable global whose locale has no
 * row gets one with the shared fields inherited from the default-locale row.
 *
 * `staged` writes the staged change for that locale instead, which is how an
 * editor drafts against a live global. It must already exist (only
 * `createStaged` makes one), and it takes no version and propagates no shared
 * fields, both of which belong to the canonical row the merge writes to.
 */
export const updateGlobal = defineServiceMethod({
    summary:
        'Update a global. Fields merge: omitted fields keep their current ' +
        'value, and arrays are replaced whole. `staged` writes the staged ' +
        'change instead of the canonical row.',
    input: localised.extend({
        staged: z.boolean().optional(),
        data: updateGlobalSchema,
    }),
    output: globalSchema,
    access: globalAccess('update'),
    mutates: true,
    idempotent: true,
    handler(params, ctx): Promise<GlobalResource> {
        return updateGlobalLocale(params, ctx);
    },
});
