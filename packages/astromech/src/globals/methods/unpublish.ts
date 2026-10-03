import type { GlobalResource } from '../repository';
import { defineServiceMethod } from '@/services/define-service-method';
import { globalAccess } from '../internal/access';
import { updateGlobalLocale } from '../internal/update-global';
import { globalSchema, localised } from '../schema';

/**
 * An update that sets `unpublished` and clears `publishedAt`, so the update hooks
 * fire. A locale with no content row throws.
 */
export const unpublishGlobal = defineServiceMethod({
    summary: 'Unpublish a global.',
    input: localised,
    output: globalSchema,
    access: globalAccess('publish'),
    requires: 'statuses',
    mutates: true,
    // The global stops being served, which `ServiceMethodEffect` counts as destructive.
    destructive: true,
    idempotent: true,
    handler(params, ctx): Promise<GlobalResource> {
        const { key } = params;

        return updateGlobalLocale(
            {
                key,
                locale: params.locale,
                createMissingLocale: false,
                method: ctx.method.name,
                data: { status: 'unpublished' },
            },
            ctx
        );
    },
});
