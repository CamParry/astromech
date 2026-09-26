import { z } from '@hono/zod-openapi';
import { optionalDate, scheduleEntrySchema, statusSchema } from '@/entries/schema';
import { withFallback } from '@/services/fallback';
import {
    jsonObject,
    nullableUnparsedJsonObject,
    unparsedJsonObject,
} from '@/services/json';

/**
 * The payload a `globals.update` call carries: a fields patch and, on a global
 * with statuses, the status and publish gate, as an entry update takes them. A
 * global has no title or slug.
 */
export const updateGlobalSchema = z
    .object({
        fields: jsonObject.optional(),
        status: statusSchema.optional(),
        publishedAt: optionalDate,
    })
    .openapi('UpdateGlobal');

/**
 * `publishedAt` for `globals.schedule`. The entries schema, imported rather than
 * copied: the date coercion an ISO caller relies on is the same coercion here.
 */
export const scheduleGlobalSchema = scheduleEntrySchema;

/** The global a call addresses. */
const key = z.string();

/** The locale a call addresses; absent means the default content locale. */
const locale = z.string().optional();

/** A content-level method addresses one locale of the global. */
export const localised = z.object({ key, locale });

/**
 * The `globals.createStaged` call input. Named because the bespoke `POST
 * /:key/staged` route parses its body against it directly.
 */
export const createStagedGlobalSchema = localised.extend({
    data: updateGlobalSchema.pick({ fields: true }).optional(),
});

/**
 * One editor-owned, exactly-one, site-wide piece of content, in one locale: the
 * public `Global`. A global is addressed by its config `key` everywhere public;
 * `id` is the row it was saved as, so a relation has the shape every resource offers.
 */
export const globalSchema = z
    .object({
        id: z.string(),
        key: z.string(),
        locale: z.string(),
        /** Locales that have a content row, this one included. Sorted. */
        locales: z.array(z.string()),
        fields: unparsedJsonObject,
        status: statusSchema,
        /** True when this read is the staged change rather than the canonical row. */
        staged: z.boolean(),
        /** The publication gate, read exactly as `Entry.publishedAt` is. */
        publishedAt: withFallback(z.date().nullable(), null),
        /** When the global was first saved; every locale reports the same value. */
        createdAt: z.date(),
        /**
         * The global's last change, in any locale; every locale reports the same
         * value. A staged read reports the staged change's own last edit instead,
         * and a staged edit never moves the global's.
         */
        updatedAt: z.date(),
        /**
         * Who made this locale. Null for a write with no request identity: a seed
         * script, the CLI, the scheduler.
         */
        createdBy: withFallback(z.string().nullable(), null),
        /** Who made the global's last change (on a staged read, the staged change's). */
        updatedBy: withFallback(z.string().nullable(), null),
    })
    .openapi('Global');

/**
 * A staged read: the staged change as a `Global`, and whether the canonical was
 * written after the staged change was made from it.
 */
export const stagedGlobalSchema = globalSchema
    .extend({ diverged: z.boolean() })
    .openapi('StagedGlobal');

/** A saved snapshot of one locale of one global. */
export const globalVersionSchema = z
    .object({
        id: z.string(),
        key: z.string(),
        locale: z.string(),
        /** Position in the sequence, which runs per global and locale from 1. */
        version: z.number(),
        fields: nullableUnparsedJsonObject,
        status: withFallback(statusSchema.nullable(), null),
        createdAt: z.date(),
        createdBy: withFallback(z.string().nullable(), null),
    })
    .openapi('GlobalVersion');
