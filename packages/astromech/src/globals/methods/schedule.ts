import type { GlobalResource } from '../repository';
import { scheduleSchema } from '@/content/schema';
import { defineServiceMethod } from '@/services/define-service-method';
import { globalAccess } from '../internal/access';
import { changeGlobalStatus } from '../internal/update-global';
import { globalSchema, localised } from '../schema';

/**
 * An update that sets `scheduled` and `publishedAt`, so the update hooks fire and
 * the stored fields must be complete. The scheduled-publish job publishes it when
 * the time comes. A locale with no content row throws.
 */
export const scheduleGlobal = defineServiceMethod({
    summary: 'Schedule a global to publish at a future time.',
    input: localised.extend(scheduleSchema.shape),
    output: globalSchema,
    access: globalAccess('publish'),
    requires: 'statuses',
    mutates: true,
    idempotent: true,
    handler(params, ctx): Promise<GlobalResource> {
        return changeGlobalStatus(params, 'scheduled', ctx);
    },
});
