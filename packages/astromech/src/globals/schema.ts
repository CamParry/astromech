import { z } from '@hono/zod-openapi';
import { scheduleEntrySchema } from '@/entries/schema';
import { jsonObject } from '@/services/json';

/**
 * The payload a `globals.update` call carries. A global has no title, slug or
 * status to write: status moves through `publish`/`unpublish`/`schedule`.
 */
export const updateGlobalSchema = z
    .object({ fields: jsonObject })
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
    data: updateGlobalSchema.optional(),
});
