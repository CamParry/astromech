/**
 * Forward versioning: createStaged / getStaged / mergeStaged / deleteStaged.
 * `site` is the only global in the test config that declares `staging`, so the
 * capability gate is exercised against `contact`.
 */

import { createTestDb, setupTestConfig } from '@tests/harness';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentServices } from '@/app-context/services';
import { getDb } from '@/database/registry';
import { CapabilityError } from '@/errors/capability';
import {
    ResourceNotFoundError,
    ResourceValidationError,
    StagedChangeExistsError,
} from '@/errors/resource';
import { ValidationError } from '@/errors/validation';
import { makeGlobalsConfig } from './globals-config';

const api = currentServices.globals;

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(makeGlobalsConfig());
});

/** A saved, published `site` in the default locale. */
async function saveSite(): Promise<void> {
    await api.update({ key: 'site', data: { fields: { title: 'Live', brand: 'Acme' } } });
    await api.publish({ key: 'site' });
}

describe('createStaged', () => {
    it('copies the canonical content into an unpublished staged row', async () => {
        await saveSite();
        const staged = await api.createStaged({ key: 'site' });

        expect(staged.staged).toBe(true);
        expect(staged.status).toBe('unpublished');
        expect(staged.fields).toEqual({ title: 'Live', brand: 'Acme' });
    });

    it('patches `data.fields` over the copy', async () => {
        await saveSite();
        const staged = await api.createStaged({
            key: 'site',
            data: { fields: { title: 'Draft' } },
        });

        expect(staged.fields).toEqual({ title: 'Draft', brand: 'Acme' });
        // The canonical is untouched.
        const live = await api.get({ key: 'site', full: true });
        expect(live?.fields['title']).toBe('Live');
    });

    it('refuses a second staged change for the same locale', async () => {
        await saveSite();
        await api.createStaged({ key: 'site' });

        await expect(api.createStaged({ key: 'site' })).rejects.toThrow(
            StagedChangeExistsError
        );
    });

    it('refuses a global that has never been saved', async () => {
        await expect(api.createStaged({ key: 'site' })).rejects.toThrow(
            ResourceNotFoundError
        );
    });

    it('refuses a global without the staging capability', async () => {
        await api.update({ key: 'contact', data: { fields: {} } });
        await expect(api.createStaged({ key: 'contact' })).rejects.toThrow(
            'Global "contact" does not support capability: staging'
        );
        await expect(api.createStaged({ key: 'contact' })).rejects.toThrow(
            CapabilityError
        );
    });
});

describe('getStaged', () => {
    it('answers null when there is none, and the staged row when there is', async () => {
        await saveSite();
        expect(await api.getStaged({ key: 'site' })).toBeNull();

        await api.createStaged({ key: 'site', data: { fields: { title: 'Draft' } } });
        const staged = await api.getStaged({ key: 'site' });
        expect(staged?.fields['title']).toBe('Draft');
        expect(staged?.staged).toBe(true);
    });

    it('is also reachable through get with staged + full', async () => {
        await saveSite();
        await api.createStaged({ key: 'site', data: { fields: { title: 'Draft' } } });

        const staged = await api.get({ key: 'site', staged: true, full: true });
        expect(staged?.fields['title']).toBe('Draft');
    });

    it('answers null through get for a global that has never been saved', async () => {
        expect(await api.get({ key: 'site', staged: true, full: true })).toBeNull();
    });

    it('refuses a staged read in the public shape', async () => {
        await saveSite();
        await expect(api.get({ key: 'site', staged: true })).rejects.toThrow(
            ResourceValidationError
        );

        try {
            await api.get({ key: 'site', staged: true });
            expect.unreachable('a public staged read must be refused');
        } catch (e) {
            expect((e as ResourceValidationError).form?.[0]).toContain(
                '`staged` requires `full`'
            );
        }
    });
});

describe('the global row stamp and divergence', () => {
    const t0 = new Date('2026-01-01T00:00:00.000Z');
    const t1 = new Date('2026-01-02T00:00:00.000Z');
    const t2 = new Date('2026-01-03T00:00:00.000Z');

    beforeEach(async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(t0);
        await saveSite();
        vi.setSystemTime(t1);
        await api.createStaged({ key: 'site' });
        vi.setSystemTime(t2);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    async function globalUpdatedAt(): Promise<Date> {
        const row = await getDb()
            .selectFrom('globals')
            .select('updatedAt')
            .where('key', '=', 'site')
            .executeTakeFirstOrThrow();
        return new Date(row.updatedAt);
    }

    it('reports a staged change as not diverged while the canonical is untouched', async () => {
        expect((await api.getStaged({ key: 'site' }))?.diverged).toBe(false);
    });

    it('reports it diverged once the canonical is written after it', async () => {
        await api.update({ key: 'site', data: { fields: { title: 'Edited' } } });

        expect((await api.getStaged({ key: 'site' }))?.diverged).toBe(true);
    });

    it('leaves the global row alone on a staged create and a staged write', async () => {
        await api.update({ key: 'site', staged: true, data: { fields: { title: 'D' } } });

        expect(await globalUpdatedAt()).toEqual(t0);
    });

    it('stamps the global row on a merge', async () => {
        const merged = await api.mergeStaged({ key: 'site' });

        expect(await globalUpdatedAt()).toEqual(t2);
        expect(merged.updatedAt).toEqual(t2);
    });

    it('keeps the content row timestamps out of the public shape', async () => {
        const staged = await api.getStaged({ key: 'site' });
        const canonical = await api.get({ key: 'site', full: true });

        for (const read of [staged, canonical]) {
            expect(read).not.toHaveProperty('contentId');
            expect(read).not.toHaveProperty('contentCreatedAt');
            expect(read).not.toHaveProperty('contentUpdatedAt');
        }
    });
});

describe('update with staged', () => {
    it('edits the staged row and leaves the canonical alone', async () => {
        await saveSite();
        await api.createStaged({ key: 'site' });

        const edited = await api.update({
            key: 'site',
            staged: true,
            data: { fields: { title: 'Draft' } },
        });

        expect(edited.staged).toBe(true);
        expect(edited.fields).toEqual({ title: 'Draft', brand: 'Acme' });
        expect((await api.getStaged({ key: 'site' }))?.fields['title']).toBe('Draft');
        const live = await api.get({ key: 'site', full: true });
        expect(live?.fields['title']).toBe('Live');
        expect(live?.staged).toBe(false);
    });

    it('takes no version — the history belongs to the canonical row', async () => {
        await saveSite();
        await api.createStaged({ key: 'site' });

        await api.update({ key: 'site', staged: true, data: { fields: { title: 'A' } } });
        await api.update({ key: 'site', staged: true, data: { fields: { title: 'B' } } });

        expect(await api.versions({ key: 'site' })).toEqual([]);
    });

    it('validates at the draft stage, since a staged row is unpublished', async () => {
        await api.update({
            key: 'announcement',
            data: { fields: { headline: 'Launch', body: 'Soon' } },
        });
        await api.publish({ key: 'announcement' });
        await api.createStaged({ key: 'announcement' });

        const edited = await api.update({
            key: 'announcement',
            staged: true,
            data: { fields: { headline: null } },
        });
        expect(edited.fields['headline']).toBeNull();
    });

    it('leaves a shared field with the staged row until the merge', async () => {
        await saveSite();
        await api.update({
            key: 'site',
            locale: 'de',
            data: { fields: { title: 'DE' } },
        });
        await api.createStaged({ key: 'site' });

        await api.update({
            key: 'site',
            staged: true,
            data: { fields: { brand: 'Staged' } },
        });

        const de = await api.get({ key: 'site', locale: 'de', full: true });
        expect(de?.fields['brand']).toBe('Acme');
    });

    it('refuses a global that has never been saved', async () => {
        await expect(
            api.update({ key: 'site', staged: true, data: { fields: { title: 'X' } } })
        ).rejects.toThrow(ResourceNotFoundError);
    });

    it('refuses a locale with no staged change', async () => {
        await saveSite();
        await expect(
            api.update({ key: 'site', staged: true, data: { fields: { title: 'X' } } })
        ).rejects.toThrow(ResourceNotFoundError);
    });

    it('refuses a global without the staging capability', async () => {
        await api.update({ key: 'contact', data: { fields: {} } });
        await expect(
            api.update({
                key: 'contact',
                staged: true,
                data: { fields: { email: 'a@b.dev' } },
            })
        ).rejects.toThrow(CapabilityError);
    });
});

describe('mergeStaged', () => {
    it('copies the staged fields onto the canonical, snapshots it and clears the staged row', async () => {
        await saveSite();
        await api.createStaged({ key: 'site', data: { fields: { title: 'Draft' } } });

        const merged = await api.mergeStaged({ key: 'site' });

        expect(merged.staged).toBe(false);
        expect(merged.fields['title']).toBe('Draft');
        // Content-only: the canonical keeps the status it had.
        expect(merged.status).toBe('published');
        expect(await api.getStaged({ key: 'site' })).toBeNull();

        const versions = await api.versions({ key: 'site' });
        expect(versions[0]?.fields).toEqual({ title: 'Live', brand: 'Acme' });
    });

    it('refuses when there is no staged change, with a 404', async () => {
        await saveSite();
        await expect(api.mergeStaged({ key: 'site' })).rejects.toMatchObject({
            name: 'ResourceNotFoundError',
            status: 404,
            message: "Global 'site' has no staged change in locale 'en'",
        });
        await expect(api.deleteStaged({ key: 'site' })).rejects.toMatchObject({
            status: 404,
        });
    });

    it('validates the staged content against the canonical status before writing', async () => {
        await api.update({
            key: 'announcement',
            data: { fields: { headline: 'Launch', body: 'Soon' } },
        });
        await api.publish({ key: 'announcement' });
        // Editing a staged row validates at the draft stage, so clearing a
        // required field is allowed there.
        await api.createStaged({
            key: 'announcement',
            data: { fields: { headline: null } },
        });

        await expect(api.mergeStaged({ key: 'announcement' })).rejects.toThrow(
            ValidationError
        );
        // A rejected merge costs no backup version and keeps the staged row.
        expect(await api.versions({ key: 'announcement' })).toHaveLength(0);
        expect(await api.getStaged({ key: 'announcement' })).not.toBeNull();
        const live = await api.get({ key: 'announcement', full: true });
        expect(live?.fields['headline']).toBe('Launch');
    });
});

describe('deleteStaged', () => {
    it('discards the staged row, leaving the canonical alone', async () => {
        await saveSite();
        await api.createStaged({ key: 'site', data: { fields: { title: 'Draft' } } });

        await api.deleteStaged({ key: 'site' });

        expect(await api.getStaged({ key: 'site' })).toBeNull();
        const live = await api.get({ key: 'site', full: true });
        expect(live?.fields['title']).toBe('Live');
    });

    it('refuses when there is no staged change', async () => {
        await saveSite();
        await expect(api.deleteStaged({ key: 'site' })).rejects.toThrow(
            /no staged change/
        );
    });
});
