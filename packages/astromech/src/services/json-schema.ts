/**
 * A method schema written as JSON Schema 2020-12, the dialect of the method
 * manifest and of the OpenAPI 3.1 document: the JSON a caller sends or receives,
 * so a `Date` is an ISO string.
 */

import { z } from '@hono/zod-openapi';

/** What `toJsonSchema` writes: one side of the schema. */
export type JsonSchemaOptions = {
    io: 'input' | 'output';
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
