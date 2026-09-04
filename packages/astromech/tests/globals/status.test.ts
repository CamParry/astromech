/**
 * Publish, unpublish and schedule. Each addresses a row that must already
 * exist — only `update` creates one — and each needs the `statuses` capability.
 */

import { createTestDb, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { CapabilityError } from '@/entries/errors';
import { GlobalNotFoundError } from '@/globals/errors';
import { globalsService as api } from '@/globals/service';
import { makeGlobalsConfig } from './globals-config';

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(makeGlobalsConfig());
});

describe('publish / unpublish / schedule', () => {
    it('publish sets status and stamps publishedAt', async () => {
        await api.update({ key: 'contact', data: { fields: { email: 'a@b.dev' } } });
        const published = await api.publish({ key: 'contact' });

        expect(published.status).toBe('published');
        expect(published.publishedAt).toBeInstanceOf(Date);
    });

    it('publish keeps an existing publishedAt rather than restamping it', async () => {
        await api.update({ key: 'contact', data: { fields: {} } });
        const first = await api.publish({ key: 'contact' });
        await api.unpublish({ key: 'contact' });
        await api.schedule({
            key: 'contact',
            publishedAt: new Date(first.publishedAt?.getTime() ?? 0),
        });
        const again = await api.publish({ key: 'contact' });

        expect(again.publishedAt?.getTime()).toBe(first.publishedAt?.getTime());
    });

    it('unpublish clears the publish gate', async () => {
        await api.update({ key: 'contact', data: { fields: {} } });
        await api.publish({ key: 'contact' });
        const unpublished = await api.unpublish({ key: 'contact' });

        expect(unpublished.status).toBe('unpublished');
        expect(unpublished.publishedAt).toBeNull();
    });

    it('schedule sets a future publishedAt', async () => {
        await api.update({ key: 'contact', data: { fields: {} } });
        const future = new Date(Date.now() + 86_400_000);
        const scheduled = await api.schedule({ key: 'contact', publishedAt: future });

        expect(scheduled.status).toBe('scheduled');
        expect(scheduled.publishedAt?.getTime()).toBe(future.getTime());
    });

    it('writes no version, because a status change changes no content', async () => {
        await api.update({ key: 'contact', data: { fields: { email: 'a@b.dev' } } });
        await api.publish({ key: 'contact' });

        expect(await api.versions({ key: 'contact' })).toEqual([]);
    });
});

describe('the capability and the row', () => {
    it('refuses a global with statuses off', async () => {
        await api.update({ key: 'banner', data: { fields: { message: 'hi' } } });
        await expect(api.publish({ key: 'banner' })).rejects.toThrow(CapabilityError);
        await expect(api.publish({ key: 'banner' })).rejects.toThrow(
            'Global "banner" does not support capability: statuses'
        );
    });

    it('refuses a locale that has never been saved', async () => {
        await expect(api.publish({ key: 'contact' })).rejects.toThrow(
            GlobalNotFoundError
        );

        await api.update({ key: 'site', data: { fields: { title: 'EN' } } });
        await expect(api.publish({ key: 'site', locale: 'de' })).rejects.toThrow(
            /not found in locale 'de'/
        );
    });
});
