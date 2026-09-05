import type { JsonObject } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { scheduleEntrySchema } from '@/entries/schema';

/**
 * A field patch. Typed as `JsonObject` to match `GlobalUpdateData`, while the
 * runtime schema stays an open record: whether a value fits its field is
 * `parseFields`' job, not this schema's.
 */
const fields = z.record(z.string(), z.unknown()) as unknown as z.ZodType<JsonObject>;

/**
 * The payload a `globals.update` call carries. A global has no title, slug or
 * status to write: status moves through `publish`/`unpublish`/`schedule`.
 */
export const updateGlobalSchema = z.object({ fields }).openapi('UpdateGlobal');

/**
 * `publishedAt` for `globals.schedule`. The entries schema, imported rather than
 * copied: the date coercion an ISO caller relies on is the same coercion here.
 */
export const scheduleGlobalSchema = scheduleEntrySchema;

/** The global a call addresses. */
export const key = z.string();

/** The locale a call addresses; absent means the default content locale. */
export const locale = z.string().optional();

/** A content-level method addresses one locale of the global. */
export const localised = z.object({ key, locale });

/**
 * The `globals.createStaged` call input. Named because the bespoke `POST
 * /:key/staged` route parses its body against it directly.
 */
export const createStagedGlobalSchema = localised.extend({
    data: updateGlobalSchema.optional(),
});
