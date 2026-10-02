/**
 * The edges of the helpers the resources share, each reached on a real
 * database: what a resource config answers for a target nothing declares, a
 * translation with no default-locale row, the relationship index and usage
 * helpers, a restore of a version that stored no fields, and the columns a
 * version snapshot carries.
 */

import type { AstromechConfig, Field, ResolvedConfig } from '@/types/index';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { currentServices } from '@/app-context/services';
import { pruneDanglingRelations } from '@/content/dangling-relations';
import { mergeContentReferences } from '@/content/relationships';
import { relationshipRepository } from '@/content/repository/relationships';
import { RESOURCE_CONFIG } from '@/content/resources';
import { listUsage } from '@/content/usage';
import { getDb } from '@/database/registry';
import { entrySnapshotSchema } from '@/entries/schema';
import { syncGlobalRelationships } from '@/globals/relationships';
import { globalSnapshotSchema } from '@/globals/schema';
import { mediaSnapshotSchema } from '@/media/schema';
import { RESOURCE_TYPES } from '@/types/domain';
import { userSnapshotSchema } from '@/users/schema';

const entriesService = currentServices.entries;
const globalsService = currentServices.globals;
const usersService = currentServices.users;

/** `post` translatable with a shared field; one global; nothing on users or media. */
function makeConfig(): AstromechConfig {
    return {
        ...makeTestConfig(),
        globals: [
            {
                key: 'site',
                label: 'Site',
                translatable: true,
                fields: [
                    { name: 'brand', type: 'text', label: 'Brand', translatable: false },
                ],
            },
        ],
    };
}

let config: ResolvedConfig;

beforeEach(async () => {
    await createTestDb();
    config = setupTestConfig(makeConfig());
});

/** What each resource config calls itself when no target is named. */
const UNNAMED: Record<(typeof RESOURCE_TYPES)[number], string> = {
    entry: "Entry type ''",
    global: "Global ''",
    user: 'User content',
    media: 'Media',
};

describe('RESOURCE_CONFIG', () => {
    it.each(RESOURCE_TYPES)('%s answers for a target nothing declares', (kind) => {
        const resourceConfig = RESOURCE_CONFIG[kind];
        expect(resourceConfig.kind).toBe(kind);
        expect(resourceConfig.fields(config, 'nope')).toEqual([]);
        expect(resourceConfig.translatable(config, 'nope')).toBe(false);
        expect(resourceConfig.validate(config, 'nope')).toBeUndefined();
    });

    // This config declares no user or media fields, so every list is empty.
    it.each(RESOURCE_TYPES)('%s answers for a call that names no target', (kind) => {
        const resourceConfig = RESOURCE_CONFIG[kind];
        expect(resourceConfig.fields(config)).toEqual([]);
        expect(resourceConfig.translatable(config)).toBe(false);
        expect(resourceConfig.validate(config)).toBeUndefined();
        expect(resourceConfig.name()).toBe(UNNAMED[kind]);
    });

    it('treats an undeclared entry type as having statuses, and a global as not', () => {
        expect(RESOURCE_CONFIG.global.hasStatuses(config, 'nope')).toBe(false);
        expect(RESOURCE_CONFIG.entry.hasStatuses(config)).toBe(true);
        expect(RESOURCE_CONFIG.global.hasStatuses(config)).toBe(false);
        expect(RESOURCE_CONFIG.user.hasStatuses(config)).toBe(false);
        expect(RESOURCE_CONFIG.media.hasStatuses(config)).toBe(false);
    });

    it('reads a declared target', () => {
        expect(RESOURCE_CONFIG.entry.translatable(config, 'post')).toBe(true);
        expect(RESOURCE_CONFIG.global.translatable(config, 'site')).toBe(true);
        expect(RESOURCE_CONFIG.global.fields(config, 'site').map((f) => f.name)).toEqual([
            'brand',
        ]);
        expect(RESOURCE_CONFIG.entry.name('post')).toBe("Entry type 'post'");
    });
});

describe('a translation with no default-locale row', () => {
    // A third locale, so a global first saved in `de` gets a translation whose
    // default-locale row is missing. An entry refuses that write instead.
    it('keeps the shared values it was written with', async () => {
        setupTestConfig({ ...makeConfig(), locales: ['en', 'de', 'fr'] });
        await globalsService.update({
            key: 'site',
            locale: 'de',
            data: { fields: { brand: 'Marke' } },
        });

        await globalsService.update({
            key: 'site',
            locale: 'fr',
            data: { fields: { brand: 'Marque' } },
        });

        const fr = await globalsService.get({ key: 'site', locale: 'fr', full: true });
        expect(fr?.fields['brand']).toBe('Marque');
    });
});

describe('the relationship helpers', () => {
    it('indexes nothing for a global row that does not exist', async () => {
        await syncGlobalRelationships(config, 'no-such-global');
        expect(await relationshipRepository.findMany()).toEqual([]);
    });

    it('marks a reference staged only when no canonical row holds it', () => {
        const reference = {
            schemaPath: 'home',
            instancePath: 'home',
            targetId: 't1',
            targetKind: 'entry' as const,
        };
        const merged = mergeContentReferences(
            [
                { fields: { home: 't1' }, stagedFor: 'row-1' },
                { fields: { home: 't1' }, stagedFor: null },
                { fields: { other: 't2' }, stagedFor: 'row-1' },
            ],
            (fields) =>
                Object.values(fields).map((targetId) => ({
                    ...reference,
                    targetId: String(targetId),
                }))
        );
        expect(merged.map((row) => [row.targetId, row.staged])).toEqual([
            ['t1', false],
            ['t2', true],
        ]);
    });

    it('drops a dead id held by a nested tree node', async () => {
        const definitions: Field[] = [
            {
                name: 'nav',
                type: 'tree',
                label: 'Nav',
                fields: [
                    { name: 'page', type: 'relationship', label: 'Page', target: 'post' },
                ],
            },
        ];
        const result = await pruneDanglingRelations(config, definitions, {
            nav: [{ _id: 'a', page: null, _children: [{ _id: 'b', page: 'gone' }] }],
        });
        expect(result.dropped).toBe(1);
        expect(result.values).toEqual({
            nav: [{ _id: 'a', page: null, _children: [{ _id: 'b', page: null }] }],
        });
    });
});

describe('version snapshots', () => {
    it('carry the resource config’s versioned columns and `fields`, nothing else', () => {
        const snapshots = {
            entry: entrySnapshotSchema,
            global: globalSnapshotSchema,
            media: mediaSnapshotSchema,
            user: userSnapshotSchema,
        };
        for (const kind of RESOURCE_TYPES) {
            expect(Object.keys(snapshots[kind].shape).sort(), kind).toEqual(
                [...RESOURCE_CONFIG[kind].versionedColumns, 'fields'].sort()
            );
        }
    });
});

describe('restoreVersion', () => {
    it('keeps the current fields when the version stored none', async () => {
        setupTestConfig({
            ...makeConfig(),
            users: { fields: [{ name: 'bio', type: 'text', label: 'Bio' }] },
        });
        const user = await usersService.create({
            data: { email: 'ann@test.dev', name: 'Ann', fields: { bio: 'Then' } },
        });
        await usersService.update({ id: user.id, data: { fields: { bio: 'Now' } } });
        // A version row may hold no fields at all; nothing writes one today.
        await getDb().updateTable('userVersions').set({ fields: null }).execute();

        const restored = await usersService.restoreVersion({ id: user.id, version: 1 });

        expect(restored.fields).toEqual({ bio: 'Now' });
    });
});

describe('listUsage', () => {
    it('keeps a source that no longer loads, with an empty title', async () => {
        const target = await entriesService.create({
            type: 'post',
            data: { title: 'T' },
        });
        await relationshipRepository.replaceForSource(
            { id: 'gone', kind: 'entry', type: 'post' },
            [
                {
                    schemaPath: 'related',
                    instancePath: 'related',
                    targetId: target.id,
                    targetKind: 'entry',
                },
            ]
        );

        const usage = await listUsage(config, { id: target.id, kind: 'entry' });
        expect(usage.map((row) => [row.sourceId, row.sourceTitle])).toEqual([
            ['gone', ''],
        ]);
    });

    it('names a global by its key when its label is a message reference', async () => {
        config = setupTestConfig({
            ...makeConfig(),
            globals: [
                {
                    key: 'site',
                    label: { $t: 'globals.site' },
                    fields: [
                        {
                            name: 'home',
                            type: 'relationship',
                            label: 'Home',
                            target: 'post',
                        },
                    ],
                },
            ],
        });
        const target = await entriesService.create({
            type: 'post',
            data: { title: 'T' },
        });
        await globalsService.update({
            key: 'site',
            data: { fields: { home: target.id } },
        });

        const usage = await listUsage(config, { id: target.id, kind: 'entry' });
        expect(usage.map((row) => [row.sourceKind, row.sourceTitle])).toEqual([
            ['global', 'site'],
        ]);
    });
});
