import { z } from '@hono/zod-openapi';
import { auditKeys, publishedAtKey, versionSchema } from '@/content/schema';
import { optionalDate, scheduleEntrySchema, statusSchema } from '@/entries/schema';
import { jsonObject, unparsedJsonObject } from '@/services/json';

/**
 * The payload a `globals.update` call carries: a fields patch and, on a global
 * with statuses, the status and publish gate, as an entry update takes them. A
 * global has no title or slug.
 */
export const updateGlobalSchema = z
    .strictObject({
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
export const localised = z.strictObject({ key, locale });

/** A version method addresses one version of one locale, by its number. */
export const versionAddress = localised.extend({ version: z.number().int() });

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
        ...publishedAtKey,
        ...auditKeys,
    })
    .openapi('Global');

/**
 * A staged read: the staged change as a `Global`, and whether the canonical was
 * written after the staged change was made from it.
 */
export const stagedGlobalSchema = globalSchema
    .extend({ diverged: z.boolean() })
    .openapi('StagedGlobal');

/** The keys a global version keeps: the fields of one locale. */
export const globalSnapshotSchema = globalSchema
    .pick({ fields: true })
    .openapi('GlobalSnapshot');

/** One saved version of one locale of a global, as `getVersion` answers it. */
export const globalVersionSchema = versionSchema('GlobalVersion', globalSnapshotSchema);
