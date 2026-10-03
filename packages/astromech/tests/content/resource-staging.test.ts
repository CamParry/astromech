/**
 * A staged change behaves the same on entries and globals when another write
 * lands between a staging call's read and its write: a create copies the
 * canonical as stored and makes one staged row, and a staged write refuses a
 * staged change that went away. Each resource's calls are a row in the adapter.
 */

import type { PluginHooks, ResolvedConfig } from '@/types/index';
import {
    createTestDb,
    makeTestConfig,
    registerTestPlugins,
    setupTestConfig,
} from '@tests/harness';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { currentServices } from '@/app-context/services';
import { entryRepository } from '@/entries/repository/entries-table';
import { ResourceNotFoundError, StagedChangeExistsError } from '@/errors/resource';
import { globalRepository } from '@/globals/repository';
import { defineHook } from '@/plugins/define-hook';

const entriesService = currentServices.entries;
const globalsService = currentServices.globals;

/** The resources that stage changes. */
const STAGED_RESOURCES = ['entry', 'global'] as const;

/**
 * How the checks reach one resource's staged change. Each resource stages one
 * text value: a `note`'s `body` field (no versions, so a staged write meets
 * only its own condition) and the `site` global's `title`. `id` is a global's key.
 */
type Adapter = {
    /** Create one whose canonical holds `value`. */
    create(value: string): Promise<string>;
    /** Write `value` to its canonical. */
    write(id: string, value: string): Promise<unknown>;
    createStaged(id: string): Promise<object>;
    getStaged(id: string): Promise<object | null>;
    /** Write `value` to its staged change. */
    writeStaged(id: string, value: string): Promise<unknown>;
    deleteStaged(id: string): Promise<unknown>;
    /** The staged value a read answered. */
    valueOf(resource: object | null): unknown;
    /** Every staged content row it has, counted in the table. */
    stagedRows(id: string): Promise<number>;
    /** Make the next read of its staged change land before `act` and answer as it read. */
    beforeStagedRead(act: () => Promise<unknown>): void;
    /** Make the next read of its canonical land before `act` and answer as it read. */
    beforeCanonicalRead(act: () => Promise<unknown>): void;
    /** Run `act` once, from the before-update hook, between a write's read and its write. */
    beforeUpdate(act: () => Promise<unknown>): void;
};

/** The resolved config of the current test, for registering a probe plugin. */
let resolved: ResolvedConfig;

/** Register a probe plugin. */
function probe(hooks: PluginHooks): void {
    registerTestPlugins([{ package: '@test/probe', hooks }], resolved);
}

/** Runs `act` on the first call only, so a write it makes does not run it again. */
function once(act: () => Promise<unknown>): () => Promise<void> {
    let done = false;
    return async () => {
        if (done) return;
        done = true;
        await act();
    };
}

/** Reads a nested text value out of a resource. */
function fieldOf(source: object | null, name: string): unknown {
    const fields = (source as { fields?: Record<string, unknown> } | null)?.fields;
    return fields?.[name];
}

const ADAPTERS: Record<(typeof STAGED_RESOURCES)[number], Adapter> = {
    entry: {
        async create(value) {
            const entry = await entriesService.create({
                type: 'note',
                data: { title: 'Note', fields: { body: value } },
            });
            return entry.id;
        },
        write: (id, value) =>
            entriesService.update({
                type: 'note',
                id,
                data: { fields: { body: value } },
            }),
        createStaged: (id) => entriesService.createStaged({ type: 'note', id }),
        getStaged: (id) => entriesService.getStaged({ type: 'note', id }),
        writeStaged: (id, value) =>
            entriesService.update({
                type: 'note',
                id,
                staged: true,
                data: { fields: { body: value } },
            }),
        deleteStaged: (id) => entriesService.deleteStaged({ type: 'note', id }),
        valueOf: (resource) => fieldOf(resource, 'body'),
        async stagedRows(id) {
            const rows = await entryRepository.findContentRowsByEntry(id);
            return rows.filter((row) => row.stagedFor !== null).length;
        },
        beforeStagedRead(act) {
            const { staging } = entryRepository;
            const findOne = staging.findOne;
            vi.spyOn(staging, 'findOne').mockImplementationOnce(async (...args) => {
                const read = await findOne(...args);
                await act();
                return read;
            });
        },
        beforeCanonicalRead(act) {
            const findOne = entryRepository.findOne;
            vi.spyOn(entryRepository, 'findOne').mockImplementationOnce(
                async (...args) => {
                    const read = await findOne(...args);
                    await act();
                    return read;
                }
            );
        },
        beforeUpdate(act) {
            probe([defineHook('entry:beforeUpdate', once(act))]);
        },
    },
    global: {
        async create(value) {
            await globalsService.update({
                key: 'site',
                data: { fields: { title: value } },
            });
            return 'site';
        },
        write: (key, value) =>
            globalsService.update({ key, data: { fields: { title: value } } }),
        createStaged: (key) => globalsService.createStaged({ key }),
        getStaged: (key) => globalsService.getStaged({ key }),
        writeStaged: (key, value) =>
            globalsService.update({
                key,
                staged: true,
                data: { fields: { title: value } },
            }),
        deleteStaged: (key) => globalsService.deleteStaged({ key }),
        valueOf: (resource) => fieldOf(resource, 'title'),
        async stagedRows(key) {
            const id = await globalRepository.findIdByKey(key);
            const { contents } = await globalRepository.findStoredRows(id ? [id] : []);
            return contents.filter((row) => row['stagedFor'] !== null).length;
        },
        beforeStagedRead(act) {
            const { staging } = globalRepository;
            const findOne = staging.findOne;
            vi.spyOn(staging, 'findOne').mockImplementationOnce(async (...args) => {
                const read = await findOne(...args);
                await act();
                return read;
            });
        },
        beforeCanonicalRead(act) {
            const findByKey = globalRepository.findByKey;
            vi.spyOn(globalRepository, 'findByKey').mockImplementationOnce(
                async (...args) => {
                    const read = await findByKey(...args);
                    await act();
                    return read;
                }
            );
        },
        beforeUpdate(act) {
            probe([defineHook('global:beforeUpdate', once(act))]);
        },
    },
};

beforeEach(async () => {
    await createTestDb();
    const config = makeTestConfig();
    if (config.entries.note) config.entries.note.staging = true;
    resolved = setupTestConfig({
        ...config,
        globals: [
            {
                key: 'site',
                label: 'Site',
                staging: true,
                fields: [{ name: 'title', type: 'text', label: 'Title' }],
            },
        ],
    });
});

describe.each(STAGED_RESOURCES)('%s', (kind) => {
    const adapter = ADAPTERS[kind];

    describe('createStaged', () => {
        it('makes one staged change when another create lands after its check', async () => {
            const id = await adapter.create('live');
            adapter.beforeStagedRead(() => adapter.createStaged(id));

            const refused = await adapter.createStaged(id).catch((err: unknown) => err);

            expect(refused).toBeInstanceOf(StagedChangeExistsError);
            expect(refused).toMatchObject({ status: 409, locale: 'en' });
            expect(await adapter.stagedRows(id)).toBe(1);
        });

        it('copies the canonical as stored when it is written after the create read it', async () => {
            const id = await adapter.create('one');
            adapter.beforeCanonicalRead(() => adapter.write(id, 'two'));

            const staged = await adapter.createStaged(id);

            expect(adapter.valueOf(staged)).toBe('two');
            expect(adapter.valueOf(await adapter.getStaged(id))).toBe('two');
        });
    });

    describe('a staged write', () => {
        it('answers 404 when the staged change is discarded between its read and its write', async () => {
            const id = await adapter.create('live');
            await adapter.createStaged(id);
            adapter.beforeUpdate(() => adapter.deleteStaged(id));

            const refused = adapter.writeStaged(id, 'draft');

            await expect(refused).rejects.toBeInstanceOf(ResourceNotFoundError);
            expect(await adapter.getStaged(id)).toBeNull();
            expect(await adapter.stagedRows(id)).toBe(0);
        });
    });
});
