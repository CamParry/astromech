/**
 * Drafts: an update to a published locale of a type with statuses saves that
 * locale's draft, and the live row changes only when `publish` folds it in
 * (`decisions/published-content-changes-through-a-draft.md`).
 *
 * `page` keeps versions and has a repeater, for the item `_id`s, and a
 * relationship to `post`, for the index. `snippet` has no statuses; `note`
 * turns staging on.
 */

import type { Entry, JsonObject } from '@/types/index';
import {
    createTestDb,
    getEntryType,
    makeTestConfig,
    registerTestPlugins,
    setupTestConfig,
    withEntryTypes,
} from '@tests/harness';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { currentServices } from '@/app-context/services';
import { getDb } from '@/database/registry';
import {
    entryDraftRepository,
    entryRepository,
} from '@/entries/repository/entries-table';
import {
    ResourceConflictError,
    ResourceNotFoundError,
    ResourceValidationError,
} from '@/errors/resource';
import { defineHook } from '@/plugins/define-hook';

const api = currentServices.entries;

beforeEach(async () => {
    await createTestDb();
    const cfg = makeTestConfig();
    getEntryType(cfg, 'note').staging = true;
    cfg.entries = withEntryTypes(cfg.entries, {
        type: 'page',
        single: 'Page',
        plural: 'Pages',
        versioning: true,
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
    });
    setupTestConfig(cfg);
});

/** `update` and the status methods answer `Entry | Entry[]`; these pass one id. */
function one(result: Entry | Entry[]): Entry {
    return Array.isArray(result) ? result[0]! : result;
}

async function publishedPage(
    data: { title?: string; slug?: string; fields?: JsonObject } = {}
) {
    return api.create({
        type: 'page',
        data: { title: 'Live', fields: { body: 'live' }, ...data, status: 'published' },
    });
}

async function draftRows() {
    return getDb().selectFrom('entryDrafts').selectAll().execute();
}

/** The live row as stored, trash included, for its content row id. */
async function liveRow(type: string, id: string) {
    const row = await entryRepository.findOne({ type, id }, { includeTrashed: true });
    if (!row) throw new Error(`no row for ${id}`);
    return row;
}

function linkedTo(targetId: string) {
    return api.query({
        type: 'page',
        full: true,
        where: { references: { path: 'link', id: targetId } },
    });
}

describe('an update to a published locale', () => {
    it('saves a draft, leaving the public read as it was', async () => {
        const page = await publishedPage();

        const saved = one(
            await api.update({
                type: 'page',
                id: page.id,
                data: { title: 'Changed', fields: { body: 'changed' } },
            })
        );

        expect(saved).toMatchObject({
            title: 'Changed',
            fields: { body: 'changed' },
            hasDraft: true,
        });
        const live = await api.get({ type: 'page', id: page.id });
        expect(live).toMatchObject({
            title: 'Live',
            fields: { body: 'live' },
            hasDraft: true,
        });
        expect(await api.versions({ type: 'page', id: page.id })).toEqual([]);
    });

    it('answers the draft on a draft read, and the live entry where there is none', async () => {
        const page = await publishedPage();
        expect(await api.get({ type: 'page', id: page.id, draft: true })).toMatchObject({
            title: 'Live',
            hasDraft: false,
        });

        await api.update({ type: 'page', id: page.id, data: { title: 'Changed' } });

        expect(await api.get({ type: 'page', id: page.id, draft: true })).toMatchObject({
            title: 'Changed',
            fields: { body: 'live' },
            hasDraft: true,
        });
    });

    it("reports the draft's own last save on a draft read, and leaves the entry's", async () => {
        const page = await publishedPage();
        const before = await api.get({ type: 'page', id: page.id, full: true });

        await api.update({ type: 'page', id: page.id, data: { title: 'Changed' } });

        const [row] = await draftRows();
        const draft = await api.get({ type: 'page', id: page.id, draft: true });
        expect(draft?.updatedAt).toEqual(new Date(String(row?.updatedAt)));
        const live = await api.get({ type: 'page', id: page.id, full: true });
        expect(live?.updatedAt).toEqual(before?.updatedAt);
    });

    it('edits the same draft on a second save, keeping what the first saved', async () => {
        const page = await publishedPage();
        await api.update({ type: 'page', id: page.id, data: { title: 'First' } });

        await api.update({
            type: 'page',
            id: page.id,
            data: { fields: { body: 'second' } },
        });

        const rows = await draftRows();
        expect(rows).toHaveLength(1);
        expect(await api.get({ type: 'page', id: page.id, draft: true })).toMatchObject({
            title: 'First',
            fields: { body: 'second' },
        });
    });

    it('fires no update hook', async () => {
        const page = await publishedPage();
        const seen: string[] = [];
        registerTestPlugins([
            {
                package: '@test/probe',
                hooks: [
                    defineHook('entry:beforeUpdate', () => {
                        seen.push('before');
                    }),
                    defineHook('entry:afterUpdate', () => {
                        seen.push('after');
                    }),
                ],
            },
        ]);

        await api.update({ type: 'page', id: page.id, data: { title: 'Changed' } });

        expect(seen).toEqual([]);
    });

    it('refuses a draft slug a live entry holds', async () => {
        await publishedPage({ title: 'Other', slug: 'taken' });
        const page = await publishedPage({ slug: 'mine' });

        const refused = api.update({
            type: 'page',
            id: page.id,
            data: { slug: 'taken' },
        });

        await expect(refused).rejects.toBeInstanceOf(ResourceValidationError);
        await expect(refused).rejects.toMatchObject({
            fields: { slug: [expect.stringContaining('taken')] },
        });
        expect(await draftRows()).toEqual([]);
    });

    it('conflicts when another save made the draft after this one read none', async () => {
        const page = await publishedPage();
        const findDraft = entryDraftRepository.findOne.bind(entryDraftRepository);
        vi.spyOn(entryDraftRepository, 'findOne').mockImplementationOnce(
            async (id, locale) => {
                const read = await findDraft(id, locale);
                await api.update({ type: 'page', id, data: { title: 'Theirs' } });
                return read;
            }
        );

        const refused = api.update({
            type: 'page',
            id: page.id,
            data: { title: 'Mine' },
        });

        await expect(refused).rejects.toBeInstanceOf(ResourceConflictError);
        await expect(refused).rejects.toMatchObject({
            details: { reason: 'draft-changed' },
        });
        expect(await api.get({ type: 'page', id: page.id, draft: true })).toMatchObject({
            title: 'Theirs',
        });
    });

    it('conflicts when another save changed the draft after this one read it', async () => {
        const page = await publishedPage();
        await api.update({ type: 'page', id: page.id, data: { title: 'First' } });
        const findDraft = entryDraftRepository.findOne.bind(entryDraftRepository);
        vi.spyOn(entryDraftRepository, 'findOne').mockImplementationOnce(
            async (id, locale) => {
                const read = await findDraft(id, locale);
                await api.update({ type: 'page', id, data: { title: 'Theirs' } });
                return read;
            }
        );

        const refused = api.update({
            type: 'page',
            id: page.id,
            data: { title: 'Mine' },
        });

        await expect(refused).rejects.toMatchObject({
            details: { reason: 'draft-changed' },
        });
        expect(await api.get({ type: 'page', id: page.id, draft: true })).toMatchObject({
            title: 'Theirs',
        });
    });

    it('conflicts when the entry is unpublished after the save read it', async () => {
        const page = await publishedPage();
        const findDraft = entryDraftRepository.findOne.bind(entryDraftRepository);
        vi.spyOn(entryDraftRepository, 'findOne').mockImplementationOnce(
            async (id, locale) => {
                const read = await findDraft(id, locale);
                await api.unpublish({ type: 'page', id });
                return read;
            }
        );

        const refused = api.update({
            type: 'page',
            id: page.id,
            data: { title: 'Mine' },
        });

        await expect(refused).rejects.toMatchObject({
            details: { reason: 'not-published' },
        });
        expect(await draftRows()).toEqual([]);
    });
});

describe('a write decided on a stale read', () => {
    /** Runs `meanwhile` after the next entry read, before the write it serves. */
    function afterNextRead(meanwhile: (id: string) => Promise<unknown>): void {
        const find = entryRepository.findOne.bind(entryRepository);
        vi.spyOn(entryRepository, 'findOne').mockImplementationOnce(
            async (ref, options) => {
                const read = await find(ref, options);
                await meanwhile(ref.id);
                return read;
            }
        );
    }

    it('conflicts when the entry is published after an update read it unpublished', async () => {
        const page = await api.create({
            type: 'page',
            data: { title: 'Live', fields: { body: 'live' } },
        });
        afterNextRead((id) => api.publish({ type: 'page', id }));

        const refused = api.update({
            type: 'page',
            id: page.id,
            data: { title: 'Mine' },
        });

        await expect(refused).rejects.toBeInstanceOf(ResourceConflictError);
        await expect(refused).rejects.toMatchObject({
            details: { reason: 'published', id: page.id, locale: 'en' },
        });
        expect(await liveRow('page', page.id)).toMatchObject({
            title: 'Live',
            status: 'published',
        });
        expect(await draftRows()).toEqual([]);
    });

    it('conflicts when a draft is saved after a status change read the entry unpublished', async () => {
        const page = await api.create({ type: 'page', data: { title: 'Live' } });
        afterNextRead(async (id) => {
            await api.publish({ type: 'page', id });
            await api.update({ type: 'page', id, data: { title: 'Theirs' } });
        });

        const refused = api.unpublish({ type: 'page', id: page.id });

        await expect(refused).rejects.toMatchObject({
            details: { reason: 'draft-changed' },
        });
        expect(await liveRow('page', page.id)).toMatchObject({ status: 'published' });
        expect(await api.get({ type: 'page', id: page.id, draft: true })).toMatchObject({
            title: 'Theirs',
        });
    });
});

describe('an update that changes nothing', () => {
    it('saves no draft, and answers the entry as read', async () => {
        const page = await publishedPage();

        const saved = one(
            await api.update({
                type: 'page',
                id: page.id,
                data: { title: 'Live', fields: { body: 'live' } },
            })
        );

        expect(saved).toMatchObject({
            title: 'Live',
            fields: { body: 'live' },
            hasDraft: false,
        });
        expect(await draftRows()).toEqual([]);
    });

    it('leaves a draft that already holds the patch as it was', async () => {
        const page = await publishedPage();
        await api.update({ type: 'page', id: page.id, data: { title: 'Changed' } });
        const [before] = await draftRows();

        const saved = one(
            await api.update({ type: 'page', id: page.id, data: { title: 'Changed' } })
        );

        expect(saved).toMatchObject({ title: 'Changed', hasDraft: true });
        expect(await draftRows()).toEqual([before]);
    });

    it('saves a patch back to the live value into the draft', async () => {
        const page = await publishedPage();
        await api.update({ type: 'page', id: page.id, data: { title: 'Changed' } });

        await api.update({ type: 'page', id: page.id, data: { title: 'Live' } });

        expect(await api.get({ type: 'page', id: page.id, draft: true })).toMatchObject({
            title: 'Live',
            hasDraft: true,
        });
    });
});

describe('an update that is still edited directly', () => {
    it('writes an unpublished entry live', async () => {
        const page = await api.create({ type: 'page', data: { title: 'Live' } });

        await api.update({ type: 'page', id: page.id, data: { title: 'Changed' } });

        expect(await api.get({ type: 'page', id: page.id, full: true })).toMatchObject({
            title: 'Changed',
            hasDraft: false,
        });
        expect(await draftRows()).toEqual([]);
    });

    it('writes a type without statuses live', async () => {
        const snippet = await api.create({
            type: 'snippet',
            data: { fields: { key: 'k', value: 'live' } },
        });

        await api.update({
            type: 'snippet',
            id: snippet.id,
            data: { fields: { value: 'changed' } },
        });

        expect(await api.get({ type: 'snippet', id: snippet.id })).toMatchObject({
            fields: { value: 'changed' },
            hasDraft: false,
        });
        expect(await draftRows()).toEqual([]);
    });

    it('writes a published entry of a staging type live, as before', async () => {
        const note = await api.create({
            type: 'note',
            data: { title: 'Live', status: 'published' },
        });

        await api.update({ type: 'note', id: note.id, data: { title: 'Changed' } });

        expect(await api.get({ type: 'note', id: note.id })).toMatchObject({
            title: 'Changed',
            hasDraft: false,
        });
        expect(await draftRows()).toEqual([]);
    });
});

describe('publish on a locale with a draft', () => {
    it('makes the draft live in the same row, keeping each item `_id`', async () => {
        const page = await publishedPage({ fields: { items: [{ label: 'a' }] } });
        const before = await liveRow('page', page.id);
        const [kept] = before.fields['items'] as { _id: string }[];
        if (!kept) throw new Error('the created item is missing');
        await api.update({
            type: 'page',
            id: page.id,
            data: {
                title: 'Changed',
                fields: { items: [{ _id: kept._id, label: 'a2' }, { label: 'b' }] },
            },
        });
        const draft = await api.get({ type: 'page', id: page.id, draft: true });

        const published = one(await api.publish({ type: 'page', id: page.id }));

        expect(published).toMatchObject({ title: 'Changed', hasDraft: false });
        const after = await liveRow('page', page.id);
        expect(after.contentId).toBe(before.contentId);
        expect(after.fields['items']).toEqual(draft?.fields['items']);
        expect((after.fields['items'] as { _id: string }[])[0]?._id).toBe(kept._id);
        expect(await draftRows()).toEqual([]);
    });

    it('writes one version, of the live content it replaces', async () => {
        const page = await publishedPage();
        await api.update({ type: 'page', id: page.id, data: { title: 'Changed' } });

        await api.publish({ type: 'page', id: page.id });

        const versions = await api.versions({ type: 'page', id: page.id });
        expect(versions).toHaveLength(1);
        const saved = await api.getVersion({ type: 'page', id: page.id, version: 1 });
        expect(saved.snapshot.title).toBe('Live');
    });

    it('fires entry:afterUpdate once, with the final content', async () => {
        const page = await publishedPage();
        await api.update({
            type: 'page',
            id: page.id,
            data: { title: 'Changed', fields: { body: 'changed' } },
        });
        const seen: unknown[] = [];
        registerTestPlugins([
            {
                package: '@test/probe',
                hooks: [
                    defineHook('entry:afterUpdate', (ctx) => {
                        seen.push(ctx.data);
                    }),
                ],
            },
        ]);

        await api.publish({ type: 'page', id: page.id });

        expect(seen).toEqual([
            expect.objectContaining({
                status: 'published',
                title: 'Changed',
                fields: expect.objectContaining({ body: 'changed' }),
            }),
        ]);
    });

    it('indexes a reference the draft added only once it is published', async () => {
        const target = await api.create({ type: 'post', data: { title: 'Target' } });
        const page = await publishedPage();
        await api.update({
            type: 'page',
            id: page.id,
            data: { fields: { link: target.id } },
        });

        expect((await linkedTo(target.id)).data).toEqual([]);

        await api.publish({ type: 'page', id: page.id });

        expect((await linkedTo(target.id)).data.map((entry) => entry.id)).toEqual([
            page.id,
        ]);
    });

    it('refuses a draft slug a live entry took after the draft was saved', async () => {
        const page = await publishedPage({ slug: 'mine' });
        await api.update({ type: 'page', id: page.id, data: { slug: 'later' } });
        await publishedPage({ title: 'Other', slug: 'later' });

        const refused = api.publish({ type: 'page', id: page.id });

        await expect(refused).rejects.toBeInstanceOf(ResourceValidationError);
        expect(await liveRow('page', page.id)).toMatchObject({
            slug: 'mine',
            hasDraft: true,
        });
    });

    it('conflicts, and keeps the newer draft, when the draft is saved after publish read it', async () => {
        const page = await publishedPage();
        await api.update({ type: 'page', id: page.id, data: { title: 'Read' } });
        const findDraft = entryDraftRepository.findOne.bind(entryDraftRepository);
        vi.spyOn(entryDraftRepository, 'findOne').mockImplementationOnce(
            async (id, locale) => {
                const read = await findDraft(id, locale);
                await api.update({ type: 'page', id, data: { title: 'Newer' } });
                return read;
            }
        );

        const refused = api.publish({ type: 'page', id: page.id });

        await expect(refused).rejects.toMatchObject({
            details: { reason: 'draft-changed', id: page.id, locale: 'en' },
        });
        expect(await liveRow('page', page.id)).toMatchObject({ title: 'Live' });
        expect(await api.get({ type: 'page', id: page.id, draft: true })).toMatchObject({
            title: 'Newer',
        });
    });
});

describe('an update naming a status on a locale with a draft', () => {
    it('writes the live row with the draft under its patch, and deletes the draft', async () => {
        const page = await publishedPage({ slug: 'live' });
        await api.update({
            type: 'page',
            id: page.id,
            data: { title: 'Draft', fields: { body: 'draft', items: [{ label: 'a' }] } },
        });

        const written = one(
            await api.update({
                type: 'page',
                id: page.id,
                data: { status: 'published', slug: 'patched', fields: { body: 'patch' } },
            })
        );

        expect(written).toMatchObject({
            title: 'Draft',
            slug: 'patched',
            fields: { body: 'patch', items: [{ label: 'a' }] },
            hasDraft: false,
        });
        expect(await draftRows()).toEqual([]);
    });
});

describe('discardDraft', () => {
    it('deletes the draft and answers the live entry; a second call is a 404', async () => {
        const page = await publishedPage();
        await api.update({ type: 'page', id: page.id, data: { title: 'Changed' } });

        const discarded = await api.discardDraft({ type: 'page', id: page.id });

        expect(discarded).toMatchObject({ title: 'Live', hasDraft: false });
        expect(await api.get({ type: 'page', id: page.id, draft: true })).toMatchObject({
            title: 'Live',
            hasDraft: false,
        });
        expect(await draftRows()).toEqual([]);
        const again = api.discardDraft({ type: 'page', id: page.id });
        await expect(again).rejects.toBeInstanceOf(ResourceNotFoundError);
        await expect(again).rejects.toMatchObject({ status: 404 });
    });
});

describe('unpublish on a locale with a draft', () => {
    it("keeps the draft's content in the row", async () => {
        const page = await publishedPage();
        await api.update({ type: 'page', id: page.id, data: { title: 'Changed' } });

        const unpublished = one(await api.unpublish({ type: 'page', id: page.id }));

        expect(unpublished).toMatchObject({
            title: 'Changed',
            status: 'unpublished',
            hasDraft: false,
        });
        expect(await draftRows()).toEqual([]);
    });
});

describe('the trash and deletion', () => {
    it('keeps a draft in the trash, and a restore folds it into the unpublished row', async () => {
        const page = await publishedPage();
        await api.update({ type: 'page', id: page.id, data: { title: 'Changed' } });

        await api.trash({ type: 'page', id: page.id });
        expect(await draftRows()).toHaveLength(1);

        const restored = one(await api.restore({ type: 'page', id: page.id }));
        expect(restored).toMatchObject({
            title: 'Changed',
            status: 'unpublished',
            hasDraft: false,
        });
        expect(await draftRows()).toEqual([]);
    });

    it('deletes the drafts with the entry', async () => {
        const page = await publishedPage();
        await api.update({ type: 'page', id: page.id, data: { title: 'Changed' } });

        await api.delete({ type: 'page', id: page.id });

        expect(await draftRows()).toEqual([]);
    });
});
