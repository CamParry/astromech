/**
 * The two axes of a global read: the row filter (is this readable at all?) and
 * the shape (which fields come back). `full` is the admin read and bypasses
 * both; the default public read applies both.
 */

import { createTestDb, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { isPublicBranded, markPublic, PublicShapeWriteError } from '@/content/visibility';
import { globalsService as api } from '@/globals/service';
import { makeGlobalsConfig } from './globals-config';

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(makeGlobalsConfig());
});

async function saveSite(): Promise<void> {
    await api.update({
        key: 'site',
        data: { fields: { title: 'Public title', brand: 'Acme', secret: 'shh' } },
    });
}

describe('the public row filter', () => {
    it('hides an unpublished global', async () => {
        await saveSite();
        expect(await api.get({ key: 'site' })).toBeNull();
    });

    it('shows a published one', async () => {
        await saveSite();
        await api.publish({ key: 'site' });

        const read = await api.get({ key: 'site' });
        expect(read?.fields['title']).toBe('Public title');
    });

    it('hides one scheduled for the future', async () => {
        await saveSite();
        await api.schedule({
            key: 'site',
            publishedAt: new Date(Date.now() + 86_400_000),
        });

        expect(await api.get({ key: 'site' })).toBeNull();
        // The admin read still sees it.
        expect(await api.get({ key: 'site', full: true })).not.toBeNull();
    });

    it('does not gate a global with statuses off', async () => {
        await api.update({ key: 'banner', data: { fields: { message: 'hi' } } });

        const read = await api.get({ key: 'banner' });
        expect(read?.fields['message']).toBe('hi');
    });
});

describe('the shape', () => {
    it('strips private fields from a public read', async () => {
        await saveSite();
        await api.publish({ key: 'site' });

        const read = await api.get({ key: 'site' });
        expect(read?.fields).toEqual({ title: 'Public title', brand: 'Acme' });
        expect(read?.fields).not.toHaveProperty('secret');
    });

    it('keeps everything on a full read', async () => {
        await saveSite();

        const read = await api.get({ key: 'site', full: true });
        expect(read?.fields['secret']).toBe('shh');
    });

    it('brands a public read', async () => {
        await saveSite();
        await api.publish({ key: 'site' });
        const read = await api.get({ key: 'site' });

        expect(isPublicBranded(read)).toBe(true);
        expect(isPublicBranded(await api.get({ key: 'site', full: true }))).toBe(false);
    });

    it('refuses a write of public-shape fields, which would drop the private ones', async () => {
        await saveSite();

        await expect(
            api.update({ key: 'site', data: { fields: markPublic({ title: 'x' }) } })
        ).rejects.toThrow(PublicShapeWriteError);
    });
});
