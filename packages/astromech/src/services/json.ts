/**
 * The JSON schemas a service method's `input` is built from: the two shapes
 * every module's `schema.ts` needs, typed as the domain types they parse to.
 */

import type { JsonValue } from '@/types/index';
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
