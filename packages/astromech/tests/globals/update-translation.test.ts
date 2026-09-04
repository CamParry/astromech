/**
 * Translation: a translatable global's second locale is created by writing it,
 * inheriting the fields marked `translatable: false` from the default-locale
 * row; a non-translatable one refuses any locale but the default.
 */

import { createTestDb, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { GlobalValidationError } from '@/globals/errors';
import { globalsService as api } from '@/globals/service';
import { makeGlobalsConfig } from './globals-config';

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(makeGlobalsConfig());
});

describe('a translatable global', () => {
    it('creates the locale on first write and inherits the shared fields', async () => {
        await api.update({
            key: 'site',
            data: { fields: { title: 'EN title', brand: 'Acme' } },
        });

        const de = await api.update({
            key: 'site',
            locale: 'de',
            data: { fields: { title: 'DE Titel' } },
        });

        expect(de.locale).toBe('de');
        expect(de.fields['title']).toBe('DE Titel');
        // `brand` is translatable: false, so it belongs to the global.
        expect(de.fields['brand']).toBe('Acme');
        expect(de.locales).toEqual(['de', 'en']);
    });

    it('propagates a shared field back to the other locales', async () => {
        await api.update({
            key: 'site',
            data: { fields: { title: 'EN', brand: 'Acme' } },
        });
        await api.update({
            key: 'site',
            locale: 'de',
            data: { fields: { title: 'DE' } },
        });

        await api.update({ key: 'site', data: { fields: { brand: 'Umbrella' } } });

        const de = await api.get({ key: 'site', locale: 'de', full: true });
        expect(de?.fields).toEqual({ title: 'DE', brand: 'Umbrella' });
    });

    it('does not propagate a translatable field', async () => {
        await api.update({ key: 'site', data: { fields: { title: 'EN', brand: 'A' } } });
        await api.update({
            key: 'site',
            locale: 'de',
            data: { fields: { title: 'DE' } },
        });

        await api.update({ key: 'site', data: { fields: { title: 'EN v2' } } });

        const de = await api.get({ key: 'site', locale: 'de', full: true });
        expect(de?.fields['title']).toBe('DE');
    });

    it('does not fall back to another locale on read', async () => {
        await api.update({ key: 'site', data: { fields: { title: 'EN' } } });
        expect(await api.get({ key: 'site', locale: 'de', full: true })).toBeNull();
    });
});

describe('a non-translatable global', () => {
    it('rejects a locale other than the default', async () => {
        await expect(
            api.update({ key: 'contact', locale: 'de', data: { fields: {} } })
        ).rejects.toThrow(GlobalValidationError);

        // The reason is a form-level message, which is what a 422 renders.
        try {
            await api.update({ key: 'contact', locale: 'de', data: { fields: {} } });
            expect.unreachable('a non-translatable global must refuse another locale');
        } catch (e) {
            expect((e as GlobalValidationError).form).toEqual([
                "Global 'contact' is not translatable, so only the 'en' locale can be written.",
            ]);
        }
    });

    it('accepts the default locale named explicitly', async () => {
        const saved = await api.update({
            key: 'contact',
            locale: 'en',
            data: { fields: { email: 'a@b.dev' } },
        });
        expect(saved.locale).toBe('en');
    });
});
