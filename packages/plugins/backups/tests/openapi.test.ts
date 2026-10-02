/**
 * The backups plugin's methods in the API's OpenAPI document: `list` takes no
 * arguments, so it documents no body, and its run's fallback keys show as the
 * nullable schemas they wrap.
 */

import { createTestDb } from '@tests/harness';
import { servedDocument } from '@tests/openapi';
import { beforeEach, describe, expect, it } from 'vitest';
import { backups } from '../src/index';

beforeEach(async () => {
    await createTestDb();
});

describe('the backups methods in the OpenAPI document', () => {
    it('documents `list` with no body and a fallback key as its nullable schema', () => {
        const { document } = servedDocument([backups()]);
        const list = document.paths['/plugins/backups/list']?.['post'];
        expect(list?.requestBody).toBeUndefined();
        expect(Object.keys(list?.responses ?? {})).toEqual(['200', '401', '403', '500']);

        const output = list?.responses['200']?.content?.['application/json'].schema;
        const run = output?.properties?.['runs']?.items;
        expect(run?.properties?.['key']).toEqual({ type: ['string', 'null'] });
        expect(run?.required).toContain('key');
    });
});
