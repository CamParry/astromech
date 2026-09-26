/**
 * Version history. A version snapshots the state an update replaces, so the
 * sequence runs per global and locale and an update that changes nothing writes
 * nothing. A version is addressed by the global's key, the locale and its number.
 */

import { createTestDb, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { currentServices } from '@/app-context/services';
import { CapabilityError } from '@/errors/capability';
import { ResourceNotFoundError } from '@/errors/resource';
import { makeGlobalsConfig } from './globals-config';

const api = currentServices.globals;

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(makeGlobalsConfig());
});

describe('versioning (on by default)', () => {
    it('snapshots the pre-update state on a content change', async () => {
        await api.update({ key: 'contact', data: { fields: { email: 'one@b.dev' } } });
        await api.update({ key: 'contact', data: { fields: { email: 'two@b.dev' } } });

        const versions = await api.versions({ key: 'contact' });
        expect(versions).toHaveLength(1);
        expect(Object.keys(versions[0] ?? {}).sort()).toEqual([
            'createdAt',
            'createdBy',
            'locale',
            'version',
        ]);
        expect(versions[0]?.version).toBe(1);
        expect(versions[0]?.locale).toBe('en');
    });

    it('writes no version for the first save, which replaces nothing', async () => {
        await api.update({ key: 'contact', data: { fields: { email: 'a@b.dev' } } });
        expect(await api.versions({ key: 'contact' })).toEqual([]);
    });

    it('writes no version when the fields are unchanged', async () => {
        await api.update({ key: 'contact', data: { fields: { email: 'a@b.dev' } } });
        await api.update({ key: 'contact', data: { fields: { email: 'a@b.dev' } } });

        expect(await api.versions({ key: 'contact' })).toEqual([]);
    });

    it('keeps a separate sequence per locale', async () => {
        await api.update({ key: 'site', data: { fields: { title: 'EN v1' } } });
        await api.update({
            key: 'site',
            locale: 'de',
            data: { fields: { title: 'DE v1' } },
        });
        await api.update({ key: 'site', data: { fields: { title: 'EN v2' } } });

        const en = await api.versions({ key: 'site' });
        const de = await api.versions({ key: 'site', locale: 'de' });

        expect(en.map((v) => v.version)).toEqual([1]);
        expect(de).toEqual([]);
        expect(en[0]?.locale).toBe('en');
        const first = await api.getVersion({ key: 'site', version: 1 });
        expect(first.snapshot.fields['title']).toBe('EN v1');
    });

    it('lists newest first', async () => {
        for (const email of ['a@b.dev', 'b@b.dev', 'c@b.dev']) {
            await api.update({ key: 'contact', data: { fields: { email } } });
        }
        const versions = await api.versions({ key: 'contact' });
        expect(versions.map((v) => v.version)).toEqual([2, 1]);
    });
});

describe('getVersion', () => {
    it('answers the metadata and the snapshot, with no internal key', async () => {
        await api.update({ key: 'contact', data: { fields: { email: 'one@b.dev' } } });
        await api.update({ key: 'contact', data: { fields: { email: 'two@b.dev' } } });

        const version = await api.getVersion({ key: 'contact', version: 1 });
        expect(Object.keys(version).sort()).toEqual([
            'createdAt',
            'createdBy',
            'locale',
            'snapshot',
            'version',
        ]);
        expect(version).toMatchObject({ version: 1, locale: 'en' });
        expect(version.snapshot).toEqual({ fields: { email: 'one@b.dev' } });
    });

    it('refuses a number the locale has no version for', async () => {
        await api.update({ key: 'contact', data: { fields: { email: 'one@b.dev' } } });
        await expect(api.getVersion({ key: 'contact', version: 1 })).rejects.toThrow(
            "Global 'contact' has no version 1 in locale 'en'"
        );
    });
});

describe('restoreVersion', () => {
    it('writes the version back and snapshots the state it overwrote', async () => {
        await api.update({ key: 'contact', data: { fields: { email: 'orig@b.dev' } } });
        await api.update({
            key: 'contact',
            data: { fields: { email: 'changed@b.dev' } },
        });
        const restored = await api.restoreVersion({ key: 'contact', version: 1 });
        expect(restored.fields).toEqual({ email: 'orig@b.dev' });

        const after = await api.versions({ key: 'contact' });
        expect(after.map((v) => v.version)).toEqual([2, 1]);
        const saved = await api.getVersion({ key: 'contact', version: 2 });
        expect(saved.snapshot.fields).toEqual({ email: 'changed@b.dev' });
    });

    it('refuses a number only another locale has a version for', async () => {
        await api.update({ key: 'site', data: { fields: { title: 'EN v1' } } });
        await api.update({ key: 'site', data: { fields: { title: 'EN v2' } } });
        await api.update({
            key: 'site',
            locale: 'de',
            data: { fields: { title: 'DE' } },
        });

        await expect(
            api.restoreVersion({ key: 'site', locale: 'de', version: 1 })
        ).rejects.toBeInstanceOf(ResourceNotFoundError);
    });
});

describe('versioning (off)', () => {
    it('refuses every version method', async () => {
        await api.update({ key: 'theme', data: { fields: { accent: 'red' } } });
        await api.update({ key: 'theme', data: { fields: { accent: 'blue' } } });

        await expect(api.versions({ key: 'theme' })).rejects.toThrow(CapabilityError);
        await expect(api.getVersion({ key: 'theme', version: 1 })).rejects.toThrow(
            CapabilityError
        );
        await expect(api.restoreVersion({ key: 'theme', version: 1 })).rejects.toThrow(
            'Global "theme" does not support capability: versioning'
        );
    });
});
