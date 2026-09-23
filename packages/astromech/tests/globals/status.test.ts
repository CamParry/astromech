/**
 * Publish, unpublish and schedule. Each addresses a row that must already
 * exist — only `update` creates one — and each needs the `statuses` capability.
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
            ResourceNotFoundError
        );

        await api.update({ key: 'site', data: { fields: { title: 'EN' } } });
        await expect(api.publish({ key: 'site', locale: 'de' })).rejects.toThrow(
            /not found in locale 'de'/
        );
    });
});

describe('status through update', () => {
    it('publishes on the first write, stamping publishedAt', async () => {
        const saved = await api.update({
            key: 'contact',
            data: { fields: { email: 'a@b.dev' }, status: 'published' },
        });

        expect(saved.status).toBe('published');
        expect(saved.publishedAt).toBeInstanceOf(Date);
    });

    it('schedules an existing row with the gate it names', async () => {
        await api.update({ key: 'contact', data: { fields: {} } });
        const future = new Date(Date.now() + 86_400_000);
        const saved = await api.update({
            key: 'contact',
            data: { status: 'scheduled', publishedAt: future.toISOString() },
        });

        expect(saved.status).toBe('scheduled');
        expect(saved.publishedAt?.getTime()).toBe(future.getTime());
    });

    it('writes no version for a status change alone', async () => {
        await api.update({ key: 'contact', data: { fields: { email: 'a@b.dev' } } });
        await api.update({ key: 'contact', data: { status: 'published' } });

        expect(await api.versions({ key: 'contact' })).toEqual([]);
    });

    it('checks completeness against the status being written', async () => {
        await api.update({ key: 'announcement', data: { fields: { body: 'Soon' } } });

        await expect(
            api.update({ key: 'announcement', data: { status: 'published' } })
        ).rejects.toMatchObject({ name: 'ValidationError' });
    });

    it('refuses a status on a global without statuses', async () => {
        await expect(
            api.update({ key: 'banner', data: { fields: {}, status: 'published' } })
        ).rejects.toBeInstanceOf(CapabilityError);
    });

    it('refuses a status on a staged write', async () => {
        await api.update({ key: 'site', data: { fields: { title: 'Live' } } });
        await api.createStaged({ key: 'site' });

        await expect(
            api.update({ key: 'site', staged: true, data: { status: 'published' } })
        ).rejects.toMatchObject({ name: 'ResourceValidationError' });
    });
});
