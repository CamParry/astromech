/**
 * Status transitions. Each is an update write, so it fires the global update
 * hooks and checks completeness when it publishes or schedules; a locale with
 * no content row is a not-found error, since only `update` may create one.
 */

import type { GlobalResource } from '../repository';
import { defineServiceMethod } from '@/services/define-service-method';
import { gate } from '../internal/access';
import { updateGlobalLocale } from '../internal/update-global';
import { globalSchema, localised, scheduleGlobalSchema } from '../schema';

/** Publishes one locale, keeping a past `publishedAt` and otherwise stamping now. */
export const publishGlobal = defineServiceMethod({
    summary: 'Publish a global.',
    input: localised,
    output: globalSchema,
    access: gate('publish'),
    requires: 'statuses',
    mutates: true,
    idempotent: true,
    handler(params, ctx): Promise<GlobalResource> {
        return updateGlobalLocale(
            { ...params, createMissingLocale: false, data: { status: 'published' } },
            ctx
        );
    },
});

/** Unpublishes one locale, clearing its publish gate. */
export const unpublishGlobal = defineServiceMethod({
    summary: 'Unpublish a global.',
    input: localised,
    output: globalSchema,
    access: gate('publish'),
    requires: 'statuses',
    mutates: true,
    // Data-losing in the sense the effect hints mean: the global stops being
    // served. `ServiceMethodEffect` names unpublish explicitly.
    destructive: true,
    idempotent: true,
    handler(params, ctx): Promise<GlobalResource> {
        return updateGlobalLocale(
            { ...params, createMissingLocale: false, data: { status: 'unpublished' } },
            ctx
        );
    },
});

/** Schedules one locale to publish at `publishedAt`. */
export const scheduleGlobal = defineServiceMethod({
    summary: 'Schedule a global to publish at a future time.',
    input: localised.extend(scheduleGlobalSchema.shape),
    output: globalSchema,
    access: gate('publish'),
    requires: 'statuses',
    mutates: true,
    idempotent: true,
    handler(params, ctx): Promise<GlobalResource> {
        const { publishedAt, ...address } = params;
        return updateGlobalLocale(
            {
                ...address,
                createMissingLocale: false,
                data: { status: 'scheduled', publishedAt },
            },
            ctx
        );
    },
});
