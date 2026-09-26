/**
 * The JSON schemas a service method's `input` and `output` are built from: the
 * shapes every module's `schema.ts` needs, typed as the domain types they parse to.
 */

import type { JsonObject, JsonValue } from '@/types/index';
import { z } from '@hono/zod-openapi';
import * as zod from 'zod';

/**
 * One JSON value, unvalidated: whether a value fits its field is `parseFields`'
 * job, not this schema's.
 *
 * The cast is the join between the runtime schema and the type it parses to,
 * and it is the one place in the package that makes it. `z.unknown()` parses to
 * `unknown`, which is not `JsonValue`; `z.json()` types it exactly but emits a
 * recursive `anyOf` into the method manifest, where every reader of that
 * manifest deals in an open schema; and `z.custom<JsonValue>()` is a shape the
 * OpenAPI document generator refuses to render.
 */
export const jsonValue = zod.unknown() as unknown as zod.ZodType<JsonValue, JsonValue>;

/**
 * A JSON object: an open record of {@link jsonValue}, so it parses to the
 * `JsonObject` the domain types deal in.
 */
export const jsonObject = zod.record(zod.string(), jsonValue);

/**
 * A stored JSON object on the way out, typed without being walked: a write
 * already checked each value against its field, and a field definition may
 * change after the data is stored. A read only confirms it is an object.
 */
export const unparsedJsonObject = z
    .custom<JsonObject>(
        (value) => typeof value === 'object' && value !== null && !Array.isArray(value),
        { message: 'Expected a JSON object' }
    )
    .openapi({ type: 'object', additionalProperties: true });

/**
 * {@link unparsedJsonObject} or null. The OpenAPI generator drops a `.nullable()`
 * around a schema whose type is stated by hand, so `nullable` is stated as well.
 */
export const nullableUnparsedJsonObject = unparsedJsonObject
    .nullable()
    .openapi(openApi30Nullable());

/** OpenAPI 3.0's `nullable`, which the generator's metadata type leaves out. */
function openApi30Nullable(): Record<string, unknown> {
    return { nullable: true };
}
