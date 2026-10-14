/**
 * Drafts on globals: an update to a published locale of a global with statuses
 * saves that locale's draft, and the live row changes only when `publish`
 * folds it in (`decisions/published-content-changes-through-a-draft.md`). The
 * entry side is pinned in tests/entries/drafts.test.ts.
 *
 * `home` keeps versions and has a repeater, for the item `_id`s, and a
 * relationship to `post`, for the index. `banner` has no statuses; `site`
 * turns staging on.
 */

import type { AstromechConfig, Global } from '@/types/index';
import {
    createTestDb,
    makeTestConfig,
    registerTestPlugins,
    setupTestConfig,
} from '@tests/harness';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { currentServices } from '@/app-context/services';
import { relationshipRepository } from '@/content/repository/relationships';
import { getDb } from '@/database/registry';
import { ResourceConflictError, ResourceNotFoundError } from '@/errors/resource';
import { globalDraftRepository, globalRepository } from '@/globals/repository';
import { defineHook } from '@/plugins/define-hook';

const api = currentServices.globals;

function makeConfig(): AstromechConfig {
    return {
        ...makeTestConfig(),
        globals: [
            {
                key: 'home',
                label: 'Home',
                translatable: true,
                fields: [
                    { name: 'body', type: 'text', label: 'Body' },
                    {
                        name: 'items',
                        type: 'repeater',
                        label: 'Items',
                        fields: [{ name: 'label', type: 'text', label: 'Label' }],
                    },
                    { name: 'link', type: 'relationship', label: 'Link', target: 'post' },
                ],
            },
            {
                key: 'banner',
                label: 'Banner',
                statuses: false,
                fields: [{ name: 'message', type: 'text', label: 'Message' }],
            },
            {
                key: 'site',
                label: 'Site',
                staging: true,
                fields: [{ name: 'title', type: 'text', label: 'Title' }],
            },
        ],
    };
}

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(makeConfig());
});

async function publishedHome(fields: Record<string, unknown> = {}): Promise<Global> {
    return api.update({
        key: 'home',
        data: { fields: { body: 'live', ...fields }, status: 'published' },
    });
}

async function draftRows() {
    return getDb().selectFrom('globalDrafts').selectAll().execute();
}

/** The live row as stored, for its content row id. */
async function liveRow(key: string) {
    const row = await globalRepository.findByKey(key);
    if (!row) throw new Error(`no row for ${key}`);
    return row;
}

async function linkTargets(id: string): Promise<string[]> {
    const rows = await relationshipRepository.findBySource(id, 'global');
    return rows.map((row) => row.targetId);
}

describe('an update to a published locale', () => {
    it('saves a draft, leaving the public read as it was', async () => {
        await publishedHome();

        const saved = await api.update({
            key: 'home',
            data: { fields: { body: 'changed' } },
        });

        expect(saved).toMatchObject({ fields: { body: 'changed' }, hasDraft: true });
        const live = await api.get({ key: 'home', full: true });
        expect(live).toMatchObject({ fields: { body: 'live' }, hasDraft: true });
        expect(await api.versions({ key: 'home' })).toEqual([]);
    });

    it('answers the draft on a draft read, and the live global where there is none', async () => {
        await publishedHome();
        expect(await api.get({ key: 'home', draft: true })).toMatchObject({
            fields: { body: 'live' },
            hasDraft: false,
        });

        await api.update({ key: 'home', data: { fields: { body: 'changed' } } });

        expect(await api.get({ key: 'home', draft: true })).toMatchObject({
            fields: { body: 'changed' },
            hasDraft: true,
        });
    });

    it("reports the draft's own last save on a draft read, and leaves the global's", async () => {
        await publishedHome();
        const before = await api.get({ key: 'home', full: true });

        await api.update({ key: 'home', data: { fields: { body: 'changed' } } });

        const [row] = await draftRows();
        const draft = await api.get({ key: 'home', draft: true });
        expect(draft?.updatedAt).toEqual(new Date(String(row?.updatedAt)));
        const live = await api.get({ key: 'home', full: true });
        expect(live?.updatedAt).toEqual(before?.updatedAt);
    });

    it('edits the same draft on a second save, keeping what the first saved', async () => {
        await publishedHome();
        await api.update({ key: 'home', data: { fields: { body: 'first' } } });

        await api.update({ key: 'home', data: { fields: { items: [{ label: 'a' }] } } });

        expect(await draftRows()).toHaveLength(1);
        expect(await api.get({ key: 'home', draft: true })).toMatchObject({
            fields: { body: 'first', items: [{ label: 'a' }] },
        });
    });

    it('keeps one draft per locale', async () => {
        await publishedHome();
        await api.update({
            key: 'home',
            locale: 'de',
            data: { fields: { body: 'de' }, status: 'published' },
        });

        await api.update({
            key: 'home',
            locale: 'de',
            data: { fields: { body: 'de2' } },
        });

        expect(await api.get({ key: 'home', draft: true })).toMatchObject({
            fields: { body: 'live' },
            hasDraft: false,
        });
        expect(await api.get({ key: 'home', locale: 'de', draft: true })).toMatchObject({
            fields: { body: 'de2' },
            hasDraft: true,
        });
    });

    it('fires no update hook', async () => {
        await publishedHome();
        const seen: string[] = [];
        registerTestPlugins([
            {
                package: '@test/probe',
                hooks: [
                    defineHook('global:beforeUpdate', () => {
                        seen.push('before');
                    }),
                    defineHook('global:afterUpdate', () => {
                        seen.push('after');
                    }),
                ],
            },
        ]);

        await api.update({ key: 'home', data: { fields: { body: 'changed' } } });

        expect(seen).toEqual([]);
    });

    it('conflicts when another save made the draft after this one read none', async () => {
        await publishedHome();
        const findDraft = globalDraftRepository.findOne.bind(globalDraftRepository);
        vi.spyOn(globalDraftRepository, 'findOne').mockImplementationOnce(
            async (id, locale) => {
                const read = await findDraft(id, locale);
                await api.update({ key: 'home', data: { fields: { body: 'theirs' } } });
                return read;
            }
        );

        const refused = api.update({ key: 'home', data: { fields: { body: 'mine' } } });

        await expect(refused).rejects.toBeInstanceOf(ResourceConflictError);
        await expect(refused).rejects.toMatchObject({
            details: { reason: 'draft-changed' },
        });
        expect(await api.get({ key: 'home', draft: true })).toMatchObject({
            fields: { body: 'theirs' },
        });
    });

    it('conflicts when another save changed the draft after this one read it', async () => {
        await publishedHome();
        await api.update({ key: 'home', data: { fields: { body: 'first' } } });
        const findDraft = globalDraftRepository.findOne.bind(globalDraftRepository);
        vi.spyOn(globalDraftRepository, 'findOne').mockImplementationOnce(
            async (id, locale) => {
                const read = await findDraft(id, locale);
                await api.update({ key: 'home', data: { fields: { body: 'theirs' } } });
                return read;
            }
        );

        const refused = api.update({ key: 'home', data: { fields: { body: 'mine' } } });

        await expect(refused).rejects.toMatchObject({
            details: { reason: 'draft-changed' },
        });
        expect(await api.get({ key: 'home', draft: true })).toMatchObject({
            fields: { body: 'theirs' },
        });
    });

    it('conflicts when the global is unpublished after the save read it', async () => {
        await publishedHome();
        const findDraft = globalDraftRepository.findOne.bind(globalDraftRepository);
        vi.spyOn(globalDraftRepository, 'findOne').mockImplementationOnce(
            async (id, locale) => {
                const read = await findDraft(id, locale);
                await api.unpublish({ key: 'home' });
                return read;
            }
        );

        const refused = api.update({ key: 'home', data: { fields: { body: 'mine' } } });

        await expect(refused).rejects.toMatchObject({
            details: { reason: 'not-published' },
        });
        expect(await draftRows()).toEqual([]);
    });
});

describe('a write decided on a stale read', () => {
    /** Runs `meanwhile` after the next global read, before the write it serves. */
    function afterNextRead(meanwhile: () => Promise<unknown>): void {
        const find = globalRepository.findByKey.bind(globalRepository);
        vi.spyOn(globalRepository, 'findByKey').mockImplementationOnce(
            async (key, locale) => {
                const read = await find(key, locale);
                await meanwhile();
                return read;
            }
        );
    }

    it('conflicts when the global is published after an update read it unpublished', async () => {
        await api.update({ key: 'home', data: { fields: { body: 'live' } } });
        afterNextRead(() => api.publish({ key: 'home' }));

        const refused = api.update({ key: 'home', data: { fields: { body: 'mine' } } });

        await expect(refused).rejects.toBeInstanceOf(ResourceConflictError);
        await expect(refused).rejects.toMatchObject({
            details: { reason: 'published', id: 'home', locale: 'en' },
        });
        expect(await liveRow('home')).toMatchObject({
            fields: { body: 'live' },
            status: 'published',
        });
        expect(await draftRows()).toEqual([]);
    });

    it('conflicts when a draft is saved after a status change read the global unpublished', async () => {
        await api.update({ key: 'home', data: { fields: { body: 'live' } } });
        afterNextRead(async () => {
            await api.publish({ key: 'home' });
            await api.update({ key: 'home', data: { fields: { body: 'theirs' } } });
        });

        const refused = api.unpublish({ key: 'home' });

        await expect(refused).rejects.toMatchObject({
            details: { reason: 'draft-changed' },
        });
        expect(await liveRow('home')).toMatchObject({ status: 'published' });
        expect(await api.get({ key: 'home', draft: true })).toMatchObject({
            fields: { body: 'theirs' },
        });
    });
});

describe('an update that changes nothing', () => {
    it('saves no draft, and answers the global as read', async () => {
        await publishedHome();

        const saved = await api.update({
            key: 'home',
            data: { fields: { body: 'live' } },
        });

        expect(saved).toMatchObject({ fields: { body: 'live' }, hasDraft: false });
        expect(await draftRows()).toEqual([]);
    });

    it('leaves a draft that already holds the patch as it was', async () => {
        await publishedHome();
        await api.update({ key: 'home', data: { fields: { body: 'changed' } } });
        const [before] = await draftRows();

        const saved = await api.update({
            key: 'home',
            data: { fields: { body: 'changed' } },
        });

        expect(saved).toMatchObject({ fields: { body: 'changed' }, hasDraft: true });
        expect(await draftRows()).toEqual([before]);
    });

    it('saves a patch back to the live value into the draft', async () => {
        await publishedHome();
        await api.update({ key: 'home', data: { fields: { body: 'changed' } } });

        await api.update({ key: 'home', data: { fields: { body: 'live' } } });

        expect(await api.get({ key: 'home', draft: true })).toMatchObject({
            fields: { body: 'live' },
            hasDraft: true,
        });
    });
});

describe('an update that is still edited directly', () => {
    it('writes an unpublished global live', async () => {
        await api.update({ key: 'home', data: { fields: { body: 'live' } } });

        await api.update({ key: 'home', data: { fields: { body: 'changed' } } });

        expect(await api.get({ key: 'home', full: true })).toMatchObject({
            fields: { body: 'changed' },
            hasDraft: false,
        });
        expect(await draftRows()).toEqual([]);
    });

    it('writes a global without statuses live', async () => {
        await api.update({ key: 'banner', data: { fields: { message: 'live' } } });

        await api.update({ key: 'banner', data: { fields: { message: 'changed' } } });

        expect(await api.get({ key: 'banner' })).toMatchObject({
            fields: { message: 'changed' },
            hasDraft: false,
        });
        expect(await draftRows()).toEqual([]);
    });

    it('writes a published global with staging live, as before', async () => {
        await api.update({
            key: 'site',
            data: { fields: { title: 'Live' }, status: 'published' },
        });

        await api.update({ key: 'site', data: { fields: { title: 'Changed' } } });

        expect(await api.get({ key: 'site', full: true })).toMatchObject({
            fields: { title: 'Changed' },
            hasDraft: false,
        });
        expect(await draftRows()).toEqual([]);
    });
});

describe('publish on a locale with a draft', () => {
    it('makes the draft live in the same row, keeping each item `_id`', async () => {
        await publishedHome({ items: [{ label: 'a' }] });
        const before = await liveRow('home');
        const [kept] = before.fields['items'] as { _id: string }[];
        if (!kept) throw new Error('the created item is missing');
        await api.update({
            key: 'home',
            data: {
                fields: {
                    body: 'changed',
                    items: [{ _id: kept._id, label: 'a2' }, { label: 'b' }],
                },
            },
        });
        const draft = await api.get({ key: 'home', draft: true });

        const published = await api.publish({ key: 'home' });

        expect(published).toMatchObject({ fields: { body: 'changed' }, hasDraft: false });
        const after = await liveRow('home');
        expect(after.contentId).toBe(before.contentId);
        expect(after.fields['items']).toEqual(draft?.fields['items']);
        expect((after.fields['items'] as { _id: string }[])[0]?._id).toBe(kept._id);
        expect(await draftRows()).toEqual([]);
    });

    it('writes one version, of the live content it replaces', async () => {
        await publishedHome();
        await api.update({ key: 'home', data: { fields: { body: 'changed' } } });

        await api.publish({ key: 'home' });

        const versions = await api.versions({ key: 'home' });
        expect(versions).toHaveLength(1);
        const saved = await api.getVersion({ key: 'home', version: 1 });
        expect(saved.snapshot.fields).toMatchObject({ body: 'live' });
    });

    it('fires global:afterUpdate once, with the final content', async () => {
        await publishedHome();
        await api.update({ key: 'home', data: { fields: { body: 'changed' } } });
        const seen: unknown[] = [];
        registerTestPlugins([
            {
                package: '@test/probe',
                hooks: [
                    defineHook('global:afterUpdate', (ctx) => {
                        seen.push(ctx.data);
                    }),
                ],
            },
        ]);

        await api.publish({ key: 'home' });

        expect(seen).toEqual([
            expect.objectContaining({
                status: 'published',
                fields: expect.objectContaining({ body: 'changed' }),
            }),
        ]);
    });

    it('indexes a reference the draft added only once it is published', async () => {
        const target = await currentServices.entries.create({
            type: 'post',
            data: { title: 'Target' },
        });
        const home = await publishedHome();
        await api.update({ key: 'home', data: { fields: { link: target.id } } });

        expect(await linkTargets(home.id)).toEqual([]);

        await api.publish({ key: 'home' });

        expect(await linkTargets(home.id)).toEqual([target.id]);
    });

    it('conflicts, and keeps the newer draft, when the draft is saved after publish read it', async () => {
        await publishedHome();
        await api.update({ key: 'home', data: { fields: { body: 'read' } } });
        const findDraft = globalDraftRepository.findOne.bind(globalDraftRepository);
        vi.spyOn(globalDraftRepository, 'findOne').mockImplementationOnce(
            async (id, locale) => {
                const read = await findDraft(id, locale);
                await api.update({ key: 'home', data: { fields: { body: 'newer' } } });
                return read;
            }
        );

        const refused = api.publish({ key: 'home' });

        await expect(refused).rejects.toMatchObject({
            details: { reason: 'draft-changed', id: 'home', locale: 'en' },
        });
        expect(await liveRow('home')).toMatchObject({ fields: { body: 'live' } });
        expect(await api.get({ key: 'home', draft: true })).toMatchObject({
            fields: { body: 'newer' },
        });
    });
});

describe('an update naming a status on a locale with a draft', () => {
    it('writes the live row with the draft under its patch, and deletes the draft', async () => {
        await publishedHome();
        await api.update({
            key: 'home',
            data: { fields: { body: 'draft', items: [{ label: 'a' }] } },
        });

        const written = await api.update({
            key: 'home',
            data: { status: 'published', fields: { body: 'patch' } },
        });

        expect(written).toMatchObject({
            fields: { body: 'patch', items: [{ label: 'a' }] },
            hasDraft: false,
        });
        expect(await draftRows()).toEqual([]);
    });
});

describe('discardDraft', () => {
    it('deletes the draft and answers the live global; a second call is a 404', async () => {
        await publishedHome();
        await api.update({ key: 'home', data: { fields: { body: 'changed' } } });

        const discarded = await api.discardDraft({ key: 'home' });

        expect(discarded).toMatchObject({ fields: { body: 'live' }, hasDraft: false });
        expect(await api.get({ key: 'home', draft: true })).toMatchObject({
            fields: { body: 'live' },
            hasDraft: false,
        });
        expect(await draftRows()).toEqual([]);
        const again = api.discardDraft({ key: 'home' });
        await expect(again).rejects.toBeInstanceOf(ResourceNotFoundError);
        await expect(again).rejects.toMatchObject({ status: 404 });
    });
});

describe('unpublish and schedule on a locale with a draft', () => {
    it("unpublish keeps the draft's content in the row", async () => {
        await publishedHome();
        await api.update({ key: 'home', data: { fields: { body: 'changed' } } });

        const unpublished = await api.unpublish({ key: 'home' });

        expect(unpublished).toMatchObject({
            fields: { body: 'changed' },
            status: 'unpublished',
            hasDraft: false,
        });
        expect(await draftRows()).toEqual([]);
    });

    it("schedule keeps the draft's content in the row", async () => {
        await publishedHome();
        await api.update({ key: 'home', data: { fields: { body: 'changed' } } });

        const scheduled = await api.schedule({
            key: 'home',
            publishedAt: new Date(Date.now() + 86_400_000),
        });

        expect(scheduled).toMatchObject({
            fields: { body: 'changed' },
            status: 'scheduled',
            hasDraft: false,
        });
        expect(await draftRows()).toEqual([]);
    });
});
