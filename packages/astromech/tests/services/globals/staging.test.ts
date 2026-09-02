/**
 * Forward versioning: createStaged / getStaged / mergeStaged / deleteStaged.
 * `site` is the only global in the test config that declares `staging`, so the
 * capability gate is exercised against `contact`.
 */

import { createTestDb, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { CapabilityError } from '@/entries/errors';
import { ValidationError } from '@/errors/validation';
import {
    GlobalNotFoundError,
    GlobalValidationError,
    StagedGlobalExistsError,
} from '@/globals/errors';
import { globalsService as api } from '@/globals/service';
import { makeGlobalsConfig } from './globals-config';

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
            StagedGlobalExistsError
        );
    });

    it('refuses a global that has never been saved', async () => {
        await expect(api.createStaged({ key: 'site' })).rejects.toThrow(
            GlobalNotFoundError
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

    it('refuses a staged read in the public shape', async () => {
        await saveSite();
        await expect(api.get({ key: 'site', staged: true })).rejects.toThrow(
            GlobalValidationError
        );

        try {
            await api.get({ key: 'site', staged: true });
            expect.unreachable('a public staged read must be refused');
        } catch (e) {
            expect((e as GlobalValidationError).form?.[0]).toContain(
                '`staged` requires `full`'
            );
        }
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

    it('refuses when there is no staged change', async () => {
        await saveSite();
        await expect(api.mergeStaged({ key: 'site' })).rejects.toThrow(
            /No staged change/
        );
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
            /No staged change/
        );
    });
});
