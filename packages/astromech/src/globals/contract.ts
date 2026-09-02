/**
 * Globals service method contracts — the declared shape + permission + effect
 * for each verb. One catalogue for every global, not one per global: the
 * permission depends on the `key` a call names, so it is the function form of
 * `PermissionRule` rather than a fixed string.
 */

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
        permission: readGate,
        mutates: false,
    },
    update: {
        summary:
            'Update a global. Fields merge: omitted fields keep their current ' +
            'value, and arrays are replaced whole.',
        input: z.object({ key, locale, data: updateGlobalSchema }),
        permission: gate('update'),
        mutates: true,
        idempotent: true,
    },
    publish: {
        summary: 'Publish a global.',
        input: localised,
        permission: gate('publish'),
        mutates: true,
        idempotent: true,
    },
    unpublish: {
        summary: 'Unpublish a global.',
        input: localised,
        permission: gate('publish'),
        mutates: true,
        // Data-losing in the sense the effect hints mean: the global stops
        // being served. `ServiceMethodEffect` names unpublish explicitly.
        destructive: true,
        idempotent: true,
    },
    schedule: {
        summary: 'Schedule a global to publish at a future time.',
        input: localised.extend(scheduleGlobalSchema.shape),
        permission: gate('publish'),
        mutates: true,
        idempotent: true,
    },
    versions: {
        summary: 'List the version history of a global.',
        input: localised,
        permission: gate('read'),
        mutates: false,
    },
    restoreVersion: {
        summary: 'Roll a global back to an earlier version.',
        input: z.object({ key, locale, versionId: z.string() }),
        permission: gate('update'),
        mutates: true,
        idempotent: true,
    },
    createStaged: {
        summary: 'Stage a change to a global.',
        input: z.object({ key, locale, data: updateGlobalSchema.optional() }),
        permission: gate('update'),
        mutates: true,
    },
    getStaged: {
        summary: 'Get the staged change of a global.',
        input: localised,
        permission: gate('read'),
        mutates: false,
    },
    mergeStaged: {
        summary: 'Merge the staged change into a global.',
        input: localised,
        permission: gate('publish'),
        mutates: true,
    },
    deleteStaged: {
        summary: 'Discard the staged change of a global.',
        input: localised,
        permission: gate('update'),
        mutates: true,
    },
} satisfies Record<keyof GlobalsService, ServiceMethodContract>;
