/**
 * An entry type's `validate` wired through the entries service.
 *
 * The config the harness pushes is LIVE (the CLI shim, not the JSON virtual
 * module), so these exercise the config fallback rather than boot's registry.
 * A map result lands on the named field, a string lands in `form`, and a field
 * that reported for itself keeps its key.
 */

import type { AstromechConfig, ResourceValidator } from '@/types/index';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { entriesService } from '@/entries/index';

const api = entriesService;

/**
 * `event` cross-checks two dates no single field can see. `flyer` reports on a
 * field that also has a rule of its own, so the two can be raced.
 */
function makeConfig(validate: ResourceValidator): AstromechConfig {
    const base = makeTestConfig();
    return {
        ...base,
        entries: {
            ...base.entries,
            event: {
                single: 'Event',
                plural: 'Events',
                fields: [
                    { name: 'starts', type: 'text', label: 'Starts' },
                    { name: 'ends', type: 'text', label: 'Ends' },
                    {
                        name: 'code',
                        type: 'text',
                        label: 'Code',
                        validation: [{ minLength: 3 }],
                    },
                ],
                validate,
            },
        },
    };
}

const endsBeforeStart: ResourceValidator = async ({ values }) => {
    const { starts, ends } = values;
    if (typeof starts === 'string' && typeof ends === 'string' && ends < starts) {
        return { ends: 'Must not be before the start' };
    }
    return undefined;
};

beforeEach(async () => {
    await createTestDb();
});

describe('a resource validator returning a field map', () => {
    beforeEach(() => setupTestConfig(makeConfig(endsBeforeStart)));

    it('rejects the create with the message on that field', async () => {
        await expect(
            api.create({
                type: 'event',
                data: {
                    title: 'E1',
                    fields: { starts: '2026-02-01', ends: '2026-01-01' },
                },
            })
        ).rejects.toMatchObject({
            name: 'ValidationError',
            fields: { ends: ['Must not be before the start'] },
        });
    });

    it('lets a valid resource through', async () => {
        const entry = await api.create({
            type: 'event',
            data: { title: 'E2', fields: { starts: '2026-01-01', ends: '2026-02-01' } },
        });
        expect(entry.fields.ends).toBe('2026-02-01');
    });

    it('rejects an update the same way', async () => {
        const entry = await api.create({
            type: 'event',
            data: { title: 'E3', fields: { starts: '2026-01-01', ends: '2026-02-01' } },
        });
        await expect(
            api.update({
                type: 'event',
                id: entry.id,
                data: { fields: { starts: '2026-03-01', ends: '2026-02-01' } },
            })
        ).rejects.toMatchObject({
            name: 'ValidationError',
            fields: { ends: ['Must not be before the start'] },
        });
    });
});

describe('a resource validator returning a string', () => {
    beforeEach(() =>
        setupTestConfig(makeConfig(async () => 'Give the event a start or a title'))
    );

    it('rejects with a form-level message and no field errors', async () => {
        await expect(
            api.create({ type: 'event', data: { title: 'E4', fields: {} } })
        ).rejects.toMatchObject({
            name: 'ValidationError',
            fields: {},
            form: ['Give the event a start or a title'],
        });
    });
});

describe('a field error and a resource error on the same key', () => {
    beforeEach(() =>
        setupTestConfig(makeConfig(async () => ({ code: 'Resource-level message' })))
    );

    it("keeps the field's own error, as the more specific one", async () => {
        await expect(
            api.create({ type: 'event', data: { title: 'E5', fields: { code: 'ab' } } })
        ).rejects.toMatchObject({
            name: 'ValidationError',
            fields: { code: ['Must be at least 3 characters'] },
        });
    });
});
