/**
 * What `withFallback` documents: the schema it wraps, as JSON Schema 2020-12
 * with a null option written as a type array, the form the OpenAPI 3.1
 * generator reads from metadata.
 */

import { OpenAPIHono, z } from '@hono/zod-openapi';
import { describe, expect, it } from 'vitest';
import { withFallback } from '@/services/fallback';

/** The schema the OpenAPI 3.1 document writes for `schema` as an object's one key. */
function documented(schema: z.ZodType): unknown {
    const app = new OpenAPIHono();
    app.openAPIRegistry.register('Probe', z.object({ key: schema }));
    const doc = app.getOpenAPI31Document({
        openapi: '3.1.0',
        info: { title: 'Probe', version: '1' },
    });
    const probe = doc.components?.schemas?.['Probe'] as {
        properties: Record<string, unknown>;
    };
    return probe.properties['key'];
}

describe('withFallback in the OpenAPI document', () => {
    it('writes a nullable scalar as a type array', () => {
        expect(documented(withFallback(z.string().nullable(), null))).toEqual({
            type: ['string', 'null'],
        });
        expect(documented(withFallback(z.date().nullable(), null))).toEqual({
            type: ['string', 'null'],
            format: 'date-time',
        });
    });

    it('writes a nullable object as a type array beside its properties', () => {
        const schema = withFallback(z.object({ a: z.string() }).nullable(), null);
        expect(documented(schema)).toMatchObject({
            type: ['object', 'null'],
            properties: { a: { type: 'string' } },
        });
    });

    it('writes an optional scalar as its own type', () => {
        expect(documented(withFallback(z.number().optional(), undefined))).toEqual({
            type: 'number',
        });
    });

    it('leaves any other union as zod writes it, which the generator cannot read', () => {
        expect(() =>
            documented(withFallback(z.union([z.string(), z.number()]), ''))
        ).toThrow('Unknown zod object type');
    });
});
