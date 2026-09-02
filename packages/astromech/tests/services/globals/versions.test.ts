/**
 * Version history. A version snapshots the state an update replaces, so the
 * sequence runs per global and locale and an update that changes nothing writes
 * nothing.
 */

import { createTestDb, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { CapabilityError } from '@/entries/errors';
import { globalsService as api } from '@/globals/service';
import { makeGlobalsConfig } from './globals-config';

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
        expect(versions[0]?.fields).toEqual({ email: 'one@b.dev' });
        expect(versions[0]?.version).toBe(1);
        expect(versions[0]?.key).toBe('contact');
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

        expect(en.map((v) => v.fields?.['title'])).toEqual(['EN v1']);
        expect(de).toEqual([]);
        expect(en[0]?.locale).toBe('en');
    });

    it('lists newest first', async () => {
        for (const email of ['a@b.dev', 'b@b.dev', 'c@b.dev']) {
            await api.update({ key: 'contact', data: { fields: { email } } });
        }
        const versions = await api.versions({ key: 'contact' });
        expect(versions.map((v) => v.version)).toEqual([2, 1]);
    });
});

describe('restoreVersion', () => {
    it('writes the version back and snapshots the state it overwrote', async () => {
        await api.update({ key: 'contact', data: { fields: { email: 'orig@b.dev' } } });
        await api.update({
            key: 'contact',
            data: { fields: { email: 'changed@b.dev' } },
        });
        const [version] = await api.versions({ key: 'contact' });
        if (!version) throw new Error('expected a version');

        const restored = await api.restoreVersion({
            key: 'contact',
            versionId: version.id,
        });
        expect(restored.fields).toEqual({ email: 'orig@b.dev' });

        const after = await api.versions({ key: 'contact' });
        expect(after).toHaveLength(2);
        expect(after[0]?.fields).toEqual({ email: 'changed@b.dev' });
    });

    it('refuses a version belonging to another locale', async () => {
        await api.update({ key: 'site', data: { fields: { title: 'EN v1' } } });
        await api.update({ key: 'site', data: { fields: { title: 'EN v2' } } });
        const [version] = await api.versions({ key: 'site' });
        if (!version) throw new Error('expected a version');
        await api.update({
            key: 'site',
            locale: 'de',
            data: { fields: { title: 'DE' } },
        });

        await expect(
            api.restoreVersion({ key: 'site', locale: 'de', versionId: version.id })
        ).rejects.toThrow(/Version not found/);
    });
});

describe('versioning (off)', () => {
    it('refuses both version methods', async () => {
        await api.update({ key: 'theme', data: { fields: { accent: 'red' } } });
        await api.update({ key: 'theme', data: { fields: { accent: 'blue' } } });

        await expect(api.versions({ key: 'theme' })).rejects.toThrow(CapabilityError);
        await expect(
            api.restoreVersion({ key: 'theme', versionId: 'anything' })
        ).rejects.toThrow('Global "theme" does not support capability: versioning');
    });
});
