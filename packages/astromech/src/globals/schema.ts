import { z } from '@hono/zod-openapi';
import { scheduleEntrySchema } from '@/entries/schema';

/**
 * The payload a `globals.update` call carries. A global has no title, slug or
 * status to write: status moves through `publish`/`unpublish`/`schedule`.
 */
export const updateGlobalSchema = z
    .object({ fields: z.record(z.string(), z.unknown()) })
    .openapi('UpdateGlobal');

/**
 * `publishedAt` for `globals.schedule`. The entries schema, imported rather than
 * copied: the date coercion an ISO caller relies on is the same coercion here.
 */
export const scheduleGlobalSchema = scheduleEntrySchema;
