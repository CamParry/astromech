/**
 * The write rules every transport inherits from the entries service rather than
 * from a REST route: a write that publishes needs the publish grant, and a
 * payload naming a column the type does not keep is refused.
 */

import { roleWith } from '@tests/fixtures';
import { contextAs, createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { entriesService } from '@/app-context/services';
import { CapabilityError } from '@/entries/errors';
import { PermissionDeniedError } from '@/errors/permission';
import { scopedServices } from '@/policies/scoped-services';

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(makeTestConfig());
});

/** A role that may write posts but not publish them. */
const writer = roleWith(['entry:post:read', 'entry:post:create', 'entry:post:update']);

/**
 * Call `fn` as a promise. The scoped handle refuses synchronously, so a refusal
 * has to be caught into a rejection for `rejects` to see it.
 */
async function attempt<T>(fn: () => Promise<T>): Promise<T> {
    return fn();
}

/** `writer` plus the publish grant. */
const publisher = roleWith([
    'entry:post:read',
    'entry:post:create',
    'entry:post:update',
    'entry:post:publish',
]);

describe('publishing through a write, on the scoped handle', () => {
    it('refuses a create that publishes without the publish grant', async () => {
        await expect(
            attempt(() =>
                scopedServices(contextAs(writer)).entries.create({
                    type: 'post',
                    data: { title: 'Live', status: 'published' },
                })
            )
        ).rejects.toMatchObject({
            name: 'PermissionDeniedError',
            permission: 'entry:post:publish',
        });
        const { data } = await entriesService.query({ type: 'post', full: true });
        expect(data).toEqual([]);
    });

    it('refuses an update that publishes without the publish grant', async () => {
        const entry = await entriesService.create({ type: 'post', data: { title: 'A' } });

        await expect(
            attempt(() =>
                scopedServices(contextAs(writer)).entries.update({
                    type: 'post',
                    id: entry.id,
                    data: { status: 'published' },
                })
            )
        ).rejects.toBeInstanceOf(PermissionDeniedError);

        const stored = await entriesService.get({
            type: 'post',
            id: entry.id,
            full: true,
        });
        expect(stored?.status).toBe('unpublished');
    });

    it('refuses a duplicate whose overrides publish the copy', async () => {
        const entry = await entriesService.create({ type: 'post', data: { title: 'A' } });

        await expect(
            attempt(() =>
                scopedServices(contextAs(writer)).entries.duplicate({
                    type: 'post',
                    id: entry.id,
                    overrides: { status: 'published' },
                })
            )
        ).rejects.toBeInstanceOf(PermissionDeniedError);
    });

    it('lets a write that does not publish through on the write grant alone', async () => {
        const entry = await scopedServices(contextAs(writer)).entries.create({
            type: 'post',
            data: { title: 'Draft' },
        });
        expect(entry.status).toBe('unpublished');
    });

    it('publishes through a write for a role holding the publish grant', async () => {
        const entry = await scopedServices(contextAs(publisher)).entries.create({
            type: 'post',
            data: { title: 'Live', status: 'published' },
        });
        expect(entry.status).toBe('published');
    });
});

describe('payload columns the type does not keep', () => {
    it('refuses a status on create for a type without statuses', async () => {
        await expect(
            entriesService.create({ type: 'snippet', data: { status: 'published' } })
        ).rejects.toMatchObject({ name: 'CapabilityError', capability: 'statuses' });
    });

    it('refuses a publishedAt on update for a type without statuses', async () => {
        const entry = await entriesService.create({ type: 'snippet', data: {} });

        await expect(
            entriesService.update({
                type: 'snippet',
                id: entry.id,
                data: { publishedAt: new Date() },
            })
        ).rejects.toBeInstanceOf(CapabilityError);
    });

    it('refuses a slug on create and update for a type without slugs', async () => {
        await expect(
            entriesService.create({ type: 'snippet', data: { slug: 'nope' } })
        ).rejects.toMatchObject({ name: 'CapabilityError', capability: 'slug' });

        const entry = await entriesService.create({ type: 'snippet', data: {} });
        await expect(
            entriesService.update({
                type: 'snippet',
                id: entry.id,
                data: { slug: 'nope' },
            })
        ).rejects.toMatchObject({ capability: 'slug' });
    });
});
