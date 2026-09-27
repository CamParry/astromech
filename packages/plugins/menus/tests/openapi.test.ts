/**
 * The menus plugin's `get` in the API's OpenAPI document. Its item schema is
 * recursive, which the generator can describe only through a named component.
 */

import { createTestDb } from '@tests/harness';
import { servedDocument } from '@tests/openapi';
import { beforeEach, describe, expect, it } from 'vitest';
import { menus } from '../src/index';

beforeEach(async () => {
    await createTestDb();
});

describe('the menus method in the OpenAPI document', () => {
    it('documents the tree through the `MenuItem` component', () => {
        const { document, warnings } = servedDocument([
            menus({ menus: [{ key: 'main', label: 'Main' }] }),
        ]);
        const get = document.paths['/plugins/menus/get']?.['post'];
        const output = get?.responses['200']?.content?.['application/json'].schema;
        // Null for a menu with no saved global.
        expect(output?.anyOf?.[0]?.items).toEqual({
            $ref: '#/components/schemas/MenuItem',
        });
        expect(output?.anyOf?.[1]).toEqual({ type: 'null' });

        const item = document.components?.schemas?.['MenuItem'];
        expect(item?.properties?.['children']?.items).toEqual({
            $ref: '#/components/schemas/MenuItem',
        });
        expect(warnings).toEqual([]);
    });
});
