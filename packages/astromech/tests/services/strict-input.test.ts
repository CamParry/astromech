/**
 * Every core method input refuses a key it does not declare, at every depth,
 * so a mis-shaped write answers 422 rather than a 200 that changed nothing.
 * Records (`fields`, entry `where`) are skipped: their keys are data.
 */

import { methodInputs, openInputObjects } from '@tests/strict-input';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { entryCatalogue } from '@/entries/catalogue';
import { entriesDefinition } from '@/entries/service';
import { globalsDefinition } from '@/globals/service';
import { mediaDefinition } from '@/media/service';
import { notificationsDefinition } from '@/notifications/service';
import { noInput } from '@/services/define-service-method';
import { usersDefinition } from '@/users/service';

describe('method inputs refuse unknown keys', () => {
    it('in every core service', () => {
        const definitions = {
            entries: entriesDefinition,
            globals: globalsDefinition,
            media: mediaDefinition,
            users: usersDefinition,
            notifications: notificationsDefinition,
        };
        const inputs = Object.assign(
            {},
            ...Object.entries(definitions).map(([domain, definition]) =>
                methodInputs(definition.catalogue, domain)
            )
        ) as Record<string, unknown>;

        expect(Object.keys(inputs).length).toBeGreaterThan(40);
        expect(openInputObjects(inputs)).toEqual([]);
    });

    it('in the per-type entry catalogue the manifest and OpenAPI document read', () => {
        for (const titled of [true, false]) {
            const catalogue = entryCatalogue({ typeId: 'posts', titled });
            expect(openInputObjects(methodInputs(catalogue, 'entries'))).toEqual([]);
        }
    });

    it('in `noInput()`', () => {
        expect(openInputObjects({ noInput: noInput() })).toEqual([]);
    });

    it('finds a plain object at any depth, and skips a record', () => {
        const input = z.strictObject({
            data: z.object({ title: z.string() }).optional(),
            items: z.array(z.union([z.string(), z.object({ id: z.string() })])),
            fields: z.record(z.string(), z.object({ loose: z.string() })),
        });

        expect(openInputObjects({ method: input })).toEqual([
            'method.data',
            'method.items[]',
        ]);
    });
});
