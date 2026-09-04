/**
 * Globals service method contracts — the declared shape + access + effect for
 * each verb. One catalogue for every global, not one per global: the permission
 * depends on the `key` a call names, so it is the function form of
 * `PermissionRule` rather than a fixed string.
 */

import type { GlobalCapability } from './internal/global';
import type { GlobalAction } from '@/permissions/global-permission';
import type {
    GlobalsService,
    PermissionRule,
    ServiceMethodContract,
} from '@/types/index';
import { z } from '@hono/zod-openapi';
import { globalPermission } from '@/permissions/global-permission';
import { findGlobal } from './internal/global';
import { scheduleGlobalSchema, updateGlobalSchema } from './schema';

/**
 * The permission action each `GlobalsService` method enforces. Merging a staged
 * change is what makes it live, so it is a publish even though the capability
 * gating it is `staging`.
 */
export const GLOBAL_METHOD_ACTIONS = {
    get: 'read',
    update: 'update',
    publish: 'publish',
    unpublish: 'publish',
    schedule: 'publish',
    versions: 'read',
    restoreVersion: 'update',
    createStaged: 'update',
    getStaged: 'read',
    mergeStaged: 'publish',
    deleteStaged: 'update',
} as const satisfies Record<keyof GlobalsService, GlobalAction>;

/**
 * The capability a `GlobalsService` method needs the global to declare. A method
 * absent from the map needs none. Read by the HTTP routes, which answer 409
 * before the service is reached, so a misconfigured global refuses with the
 * capability named rather than with the operation's own error.
 */
export const GLOBAL_METHOD_REQUIRES: Partial<
    Record<keyof GlobalsService, GlobalCapability>
> = {
    publish: 'statuses',
    unpublish: 'statuses',
    schedule: 'statuses',
    versions: 'versioning',
    restoreVersion: 'versioning',
    createStaged: 'staging',
    getStaged: 'staging',
    mergeStaged: 'staging',
    deleteStaged: 'staging',
};

/**
 * The key one call names. A call with no key is not refused here: it resolves to
 * the empty key, whose permission (`global::read`) no role holds, so the guard
 * fails closed and the service throws the error that names the real problem.
 */
function keyOf(input: unknown): string {
    if (typeof input !== 'object' || input === null) return '';
    const { key } = input as { key?: unknown };
    return typeof key === 'string' ? key : '';
}

/** True when the call asks for a shape only an authenticated read may have. */
function wantsPrivateShape(input: unknown): boolean {
    if (typeof input !== 'object' || input === null) return false;
    const { full, staged } = input as { full?: unknown; staged?: unknown };
    return full === true || staged === true;
}

/** The gate for a method whose action is the same for every call. */
function gate(action: GlobalAction): PermissionRule {
    return (input) => globalPermission(keyOf(input), action);
}

/**
 * `get`'s gate. A `public` global's plain read is what an unauthenticated
 * visitor makes, so it needs no permission; the `full` and `staged` shapes are a
 * second axis of authority and always do.
 */
const readGate: PermissionRule = (input) => {
    const key = keyOf(input);
    if (!wantsPrivateShape(input) && findGlobal(key)?.public === true) return null;
    return globalPermission(key, 'read');
};

const key = z.string();
const locale = z.string().optional();
/** A content-level method addresses one locale of the global. */
const localised = z.object({ key, locale });

export const globalsContract = {
    get: {
        summary: 'Read one locale of a global. Null when it has never been saved there.',
        input: z.object({
            key,
            locale,
            full: z.boolean().optional(),
            staged: z.boolean().optional(),
        }),
        access: readGate,
        mutates: false,
    },
    update: {
        summary:
            'Update a global. Fields merge: omitted fields keep their current ' +
            'value, and arrays are replaced whole. `staged` writes the staged ' +
            'change instead of the canonical row.',
        input: z.object({
            key,
            locale,
            staged: z.boolean().optional(),
            data: updateGlobalSchema,
        }),
        access: gate('update'),
        mutates: true,
        idempotent: true,
    },
    publish: {
        summary: 'Publish a global.',
        input: localised,
        access: gate('publish'),
        mutates: true,
        idempotent: true,
    },
    unpublish: {
        summary: 'Unpublish a global.',
        input: localised,
        access: gate('publish'),
        mutates: true,
        // Data-losing in the sense the effect hints mean: the global stops
        // being served. `ServiceMethodEffect` names unpublish explicitly.
        destructive: true,
        idempotent: true,
    },
    schedule: {
        summary: 'Schedule a global to publish at a future time.',
        input: localised.extend(scheduleGlobalSchema.shape),
        access: gate('publish'),
        mutates: true,
        idempotent: true,
    },
    versions: {
        summary: 'List the version history of a global.',
        input: localised,
        access: gate('read'),
        mutates: false,
    },
    restoreVersion: {
        summary: 'Roll a global back to an earlier version.',
        input: z.object({ key, locale, versionId: z.string() }),
        access: gate('update'),
        mutates: true,
        idempotent: true,
    },
    createStaged: {
        summary: 'Stage a change to a global.',
        input: z.object({ key, locale, data: updateGlobalSchema.optional() }),
        access: gate('update'),
        mutates: true,
    },
    getStaged: {
        summary: 'Get the staged change of a global.',
        input: localised,
        access: gate('read'),
        mutates: false,
    },
    mergeStaged: {
        summary: 'Merge the staged change into a global.',
        input: localised,
        access: gate('publish'),
        mutates: true,
    },
    deleteStaged: {
        summary: 'Discard the staged change of a global.',
        input: localised,
        access: gate('update'),
        mutates: true,
    },
} satisfies Record<keyof GlobalsService, ServiceMethodContract>;
