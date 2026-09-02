/**
 * A global write runs the same field pipeline an entry write does: the field
 * definitions decide completeness, and the global's own `validate` runs after
 * every field.
 */

import type { AstromechConfig } from '@/types/index';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { ValidationError } from '@/errors/validation';
import { globalsService as api } from '@/globals/service';

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
            {
                key: 'banner',
                label: 'Banner',
                // statuses off ⇒ every row is live, so every write is complete.
                statuses: false,
                fields: [
                    { name: 'message', type: 'text', label: 'Message', required: true },
                ],
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

    it('always requires it on a global with statuses off', async () => {
        await expect(api.update({ key: 'banner', data: { fields: {} } })).rejects.toThrow(
            ValidationError
        );
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
