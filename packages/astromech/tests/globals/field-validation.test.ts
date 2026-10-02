/**
 * A global's completeness follows its publication, as an entry's does, and the
 * global's own `validate` runs after every field. The rules every resource
 * shares are in `tests/content/resource-field-validation.test.ts`.
 */

import type { AstromechConfig } from '@/types/index';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { currentServices } from '@/app-context/services';
import { ValidationError } from '@/errors/validation';

const api = currentServices.globals;

function config(): AstromechConfig {
    return {
        ...makeTestConfig(),
        globals: [
            {
                key: 'contact',
                label: 'Contact',
                fields: [
                    { name: 'email', type: 'text', label: 'Email', required: true },
                    { name: 'phone', type: 'text', label: 'Phone' },
                ],
                validate: async ({ values }) =>
                    values['phone'] === '000' ? 'That phone number is reserved.' : null,
            },
        ],
    };
}

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(config());
});

describe('field validation', () => {
    it('lets a required field be empty while the global is unpublished', async () => {
        const saved = await api.update({ key: 'contact', data: { fields: {} } });
        expect(saved.fields).toEqual({});
    });

    it('requires it once the global is published', async () => {
        await api.update({ key: 'contact', data: { fields: { email: 'a@b.dev' } } });
        await api.publish({ key: 'contact' });

        await expect(
            api.update({ key: 'contact', data: { fields: { email: '' } } })
        ).rejects.toThrow(ValidationError);
    });

    it('refuses to publish a draft that misses it, naming the field', async () => {
        await api.update({ key: 'contact', data: { fields: { phone: '1' } } });

        await expect(api.publish({ key: 'contact' })).rejects.toMatchObject({
            name: 'ValidationError',
            fields: { email: ['This field is required'] },
        });
        expect((await api.get({ key: 'contact', full: true }))?.status).toBe(
            'unpublished'
        );
    });

    it('refuses to schedule a draft that misses it', async () => {
        await api.update({ key: 'contact', data: { fields: {} } });

        await expect(
            api.schedule({
                key: 'contact',
                publishedAt: new Date(Date.now() + 60_000),
            })
        ).rejects.toThrow(ValidationError);
    });
});

describe("the global's own validator", () => {
    it('runs and reports at form level', async () => {
        await expect(
            api.update({
                key: 'contact',
                data: { fields: { email: 'a@b.dev', phone: '000' } },
            })
        ).rejects.toThrow(ValidationError);

        try {
            await api.update({
                key: 'contact',
                data: { fields: { email: 'a@b.dev', phone: '000' } },
            });
            expect.unreachable('the validator should have refused');
        } catch (e) {
            expect((e as ValidationError).form).toEqual([
                'That phone number is reserved.',
            ]);
        }
    });

    it('accepts a value it does not object to', async () => {
        const saved = await api.update({
            key: 'contact',
            data: { fields: { email: 'a@b.dev', phone: '123' } },
        });
        expect(saved.fields['phone']).toBe('123');
    });
});
