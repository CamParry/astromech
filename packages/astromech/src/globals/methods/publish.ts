import type { GlobalResource } from '../repository';
import { defineServiceMethod } from '@/services/define-service-method';
import { globalAccess } from '../internal/access';
import { updateGlobalLocale } from '../internal/update-global';
import { globalSchema, localised } from '../schema';

/**
 * An update that sets `published`, so the update hooks fire and the stored fields
 * must be complete. An already-published locale keeps its `publishedAt`; any
 * other is stamped now. A locale with no content row throws.
 */
export const publishGlobal = defineServiceMethod({
    summary: 'Publish a global.',
    input: localised,
    output: globalSchema,
    access: globalAccess('publish'),
    requires: 'statuses',
    mutates: true,
    idempotent: true,
    handler(params, ctx): Promise<GlobalResource> {
        const { key } = params;

        return updateGlobalLocale(
            {
                key,
                locale: params.locale,
                createMissingLocale: false,
                method: ctx.method.name,
                data: { status: 'published' },
            },
            ctx
        );
    },
});
