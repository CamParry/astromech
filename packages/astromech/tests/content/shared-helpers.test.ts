/**
 * The edges of the helpers the resources share: what a resource config answers for a
 * target nothing declares, and the early returns of the translatable, index,
 * restore and usage helpers, and that each version snapshot
 * carries exactly the columns a version stores.
 */

import type { ContentRowId } from '@/content/repository/types';
import type { AstromechConfig, Field, ResolvedConfig } from '@/types/index';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { currentServices } from '@/app-context/services';
import { pruneDanglingRelations } from '@/content/dangling-relations';
import { mergeContentReferences } from '@/content/relationships';
import { relationshipRepository } from '@/content/repository/relationships';
import { RESOURCE_CONFIG } from '@/content/resources';
import { inheritSharedFields, propagateSharedFields } from '@/content/translatable';
import { listUsage } from '@/content/usage';
import { restoreVersion } from '@/content/versions';
import { entrySnapshotSchema } from '@/entries/schema';
import { syncGlobalRelationships } from '@/globals/relationships';
import { globalSnapshotSchema } from '@/globals/schema';
import { mediaSnapshotSchema } from '@/media/schema';
import { RESOURCE_TYPES } from '@/types/domain';
import { userSnapshotSchema } from '@/users/schema';

const entriesService = currentServices.entries;
const globalsService = currentServices.globals;

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

describe('RESOURCE_CONFIG', () => {
    it.each(RESOURCE_TYPES)('%s answers for a target nothing declares', (kind) => {
        const resourceConfig = RESOURCE_CONFIG[kind];
        expect(resourceConfig.kind).toBe(kind);
        expect(resourceConfig.fields(config, 'nope')).toEqual([]);
        expect(resourceConfig.translatable(config, 'nope')).toBe(false);
        expect(resourceConfig.validate(config, 'nope')).toBeUndefined();
        expect(typeof resourceConfig.name()).toBe('string');
    });

    it.each(RESOURCE_TYPES)('%s answers for a call that names no target', (kind) => {
        const resourceConfig = RESOURCE_CONFIG[kind];
        expect(resourceConfig.fields(config)).toEqual(
            kind === 'entry' || kind === 'global'
                ? []
                : resourceConfig.fields(config, 'any')
        );
        expect(resourceConfig.translatable(config)).toBe(false);
        expect(resourceConfig.validate(config)).toBeUndefined();
        expect(resourceConfig.name()).not.toContain('undefined');
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

describe('inheritSharedFields and propagateSharedFields', () => {
    it('keeps the values when the default-locale row is missing', async () => {
        const values = { brand: 'Mine' };
        const inherited = await inheritSharedFields('global', config, {
            target: 'site',
            repository: { findOne: () => Promise.resolve(null) },
            values,
            id: 'g1',
            locale: 'de',
        });
        expect(inherited).toBe(values);
    });

    it('propagates nothing without a propagator', async () => {
        await expect(
            propagateSharedFields('global', config, {
                target: 'site',
                translatable: undefined,
                record: { id: 'g1', locale: 'en' },
                fields: { brand: 'Acme' },
                patchedFieldNames: ['brand'],
            })
        ).resolves.toBeUndefined();
    });

    it('propagates only the shared fields the write patched', async () => {
        const propagateFields = vi.fn(() => Promise.resolve());
        await propagateSharedFields('global', config, {
            target: 'site',
            translatable: { propagateFields },
            record: { id: 'g1', locale: 'en' },
            fields: { brand: 'Acme' },
            patchedFieldNames: ['brand'],
        });
        expect(propagateFields).toHaveBeenCalledWith('g1', 'en', { brand: 'Acme' });
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
        const contentId = 'c1' as ContentRowId;
        const versions = {
            findMany: () => Promise.resolve([]),
            findOne: () =>
                Promise.resolve({
                    version: 1,
                    fields: null,
                    createdAt: new Date(),
                    createdBy: null,
                }),
            create: () => Promise.resolve(),
            latestNumber: () => Promise.resolve(0),
        };
        const restored = await restoreVersion({
            resource: 'user',
            versions,
            current: { contentId, locale: 'en', fields: { bio: 'Now' } },
            version: 1,
            address: { id: 'u1' },
            user: null,
            write: ({ fields }) => Promise.resolve(fields),
        });
        expect(restored).toEqual({ bio: 'Now' });
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
