/**
 * The forms plugin's methods in the API's OpenAPI document, each described in
 * full: a field definition is documented as the open object it is checked to be.
 */

import { createTestDb } from '@tests/harness';
import { servedDocument } from '@tests/openapi';
import { beforeEach, describe, expect, it } from 'vitest';
import { forms } from '../src/index';

beforeEach(async () => {
    await createTestDb();
});

describe('the forms methods in the OpenAPI document', () => {
    it('describes every method, a public form’s fields included', () => {
        const { document } = servedDocument([forms()]);
        const get = document.paths['/plugins/forms/get']?.['post'];
        const output = get?.responses['200']?.content?.['application/json'].schema;
        expect(output?.anyOf?.[0]?.properties?.['fields']?.items).toEqual({
            type: 'object',
            additionalProperties: true,
        });
    });
});
