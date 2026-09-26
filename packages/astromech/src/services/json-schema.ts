/**
 * A method schema written as JSON Schema, as the method manifest and the OpenAPI
 * document describe it: the JSON a caller sends or receives, so a `Date` is an ISO string.
 */

import { z } from '@hono/zod-openapi';

/** What `toJsonSchema` writes: a side of the schema, in one dialect. */
export type JsonSchemaOptions = {
    io: 'input' | 'output';
    /** JSON Schema 2020-12 unless given; `openapi-3.0` for the OpenAPI document. */
    target?: 'draft-2020-12' | 'openapi-3.0';
};

/**
 * `schema` as JSON Schema. A type JSON cannot carry becomes an open schema, and a
 * `Date` becomes `{ type: 'string', format: 'date-time' }`. Throws on a schema zod cannot convert.
 */
export function toJsonSchema(
    schema: z.ZodType,
    options: JsonSchemaOptions
): Record<string, unknown> {
    return z.toJSONSchema(schema, {
        ...options,
        unrepresentable: 'any',
        override: writeDateAsString,
    });
}

/** A `Date` crosses JSON as an ISO 8601 string. */
function writeDateAsString(ctx: {
    zodSchema: z.core.$ZodType;
    jsonSchema: z.core.JSONSchema.BaseSchema;
}): void {
    if (ctx.zodSchema._zod.def.type !== 'date') return;
    ctx.jsonSchema.type = 'string';
    ctx.jsonSchema.format = 'date-time';
}
