import type { GlobalResource } from '../repository';
import { z } from '@hono/zod-openapi';
import { defineServiceMethod } from '@/services/define-service-method';
import { globalAccess } from '../internal/access';
import { updateGlobalLocale } from '../internal/update-global';
import { globalSchema, localised, updateGlobalSchema } from '../schema';

/**
 * The first write to a global or a locale creates its row, inheriting a
 * translatable global's shared fields. `staged` writes the locale's staged
 * change, which `createStaged` must have made, and takes no version.
 */
export const updateGlobal = defineServiceMethod({
    summary:
        'Update a global. Fields merge: omitted fields keep their current ' +
        'value, and arrays are replaced whole. `staged` writes the staged ' +
        'change instead of the canonical row. Naming `status` or ' +
        '`publishedAt` also needs the publish permission.',
    input: localised.extend({
        staged: z.boolean().optional(),
        data: updateGlobalSchema,
    }),
    output: globalSchema,
    access: globalAccess('update'),
    mutates: true,
    idempotent: true,
    handler(params, ctx): Promise<GlobalResource> {
        return updateGlobalLocale({ ...params, method: ctx.method.name }, ctx);
    },
});
