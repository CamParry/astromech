import type { GlobalResource } from '../repository';
import { defineServiceMethod } from '@/services/define-service-method';
import { globalAccess } from '../internal/access';
import { changeGlobalStatus } from '../internal/update-global';
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
        return changeGlobalStatus(params, 'published', ctx);
    },
});
