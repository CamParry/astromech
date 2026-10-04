/**
 * The redirects plugin's service methods in the API's OpenAPI document: each
 * at the `POST /api/plugins/redirects/<method>` path it is answered on, with
 * its input as the body and its output as the bare 200.
 */

import { createTestDb } from '@tests/harness';
import { servedDocument } from '@tests/openapi';
import { beforeEach, describe, expect, it } from 'vitest';
import { redirects } from '../src/index';

beforeEach(async () => {
    await createTestDb();
});

describe('the redirects methods in the OpenAPI document', () => {
    it('documents `create` with its input as the body and its output as the bare 200', async () => {
        const { document } = await servedDocument([redirects()]);
        const create = document.paths['/plugins/redirects/create']?.['post'];
        expect(create?.summary).toBe('Create a redirect rule.');

        const body = create?.requestBody?.content['application/json']?.schema;
        expect(Object.keys(body?.properties ?? {})).toEqual(['data']);
        expect(body?.additionalProperties).toBe(false);

        const output = create?.responses['200']?.content?.['application/json'].schema;
        expect(Object.keys(output?.properties ?? {})).toEqual([
            'id',
            'from',
            'to',
            'status',
            'enabled',
            'createdAt',
            'updatedAt',
        ]);
        expect(output?.properties?.['createdAt']).toEqual({
            type: 'string',
            format: 'date-time',
        });
        expect(Object.keys(create?.responses ?? {})).toEqual([
            '200',
            '401',
            '403',
            '422',
            '500',
        ]);
    });

    it('documents the public `lookup` with no 401 or 403', async () => {
        const { document } = await servedDocument([redirects()]);
        const lookup = document.paths['/plugins/redirects/lookup']?.['post'];
        expect(Object.keys(lookup?.responses ?? {})).toEqual(['200', '422', '500']);
        const output = lookup?.responses['200']?.content?.['application/json'].schema;
        // Null for a path with no enabled rule.
        expect(output?.anyOf?.[1]).toEqual({ type: 'null' });
        expect(Object.keys(output?.anyOf?.[0]?.properties ?? {})).toEqual([
            'to',
            'status',
        ]);
    });
});
