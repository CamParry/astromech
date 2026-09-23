/**
 * A plugin field type reaches the server: the demo's `rating` is coerced,
 * defaulted and validated by the field pipeline on an entry write, the same
 * as a core type.
 */

import type { AstromechConfig, PluginFieldType } from '@/types/index';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { currentServices } from '@/app-context/services';

const api = currentServices.entries;

// The demo plugin's own module, loaded as the site loads it.
const { ratingField } = (await import(
    new URL('../../../../apps/demo/src/plugins/rating/fields/rating.ts', import.meta.url)
        .href
)) as { ratingField: PluginFieldType };

function configWithRating(): AstromechConfig {
    const config = makeTestConfig();
    return {
        ...config,
        entries: {
            ...config.entries,
            review: {
                single: 'Review',
                plural: 'Reviews',
                fields: [{ name: 'quality', type: 'rating', label: 'Quality' }],
            },
        },
        plugins: [{ package: 'demo-rating', fields: [ratingField] }],
    };
}

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(configWithRating());
});

describe('the demo rating field type on the server', () => {
    it('refuses an out-of-range value', async () => {
        await expect(
            api.create({ type: 'review', data: { title: 'Bad', fields: { quality: 9 } } })
        ).rejects.toMatchObject({
            name: 'ValidationError',
            fields: { quality: ['Rating must be between 0 and 5'] },
        });
    });

    it('gives a missing value the type’s default', async () => {
        const entry = await api.create({ type: 'review', data: { title: 'Plain' } });
        expect(entry.fields).toMatchObject({ quality: 0 });
    });

    it('coerces a numeric string before validating it', async () => {
        const entry = await api.create({
            type: 'review',
            data: { title: 'Typed', fields: { quality: '4' } },
        });
        expect(entry.fields).toMatchObject({ quality: 4 });
    });
});
