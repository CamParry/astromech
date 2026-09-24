/**
 * The globals repository: the shared content repository over
 * `globals`/`global_content`/`global_versions`, read by config `key` rather
 * than by id. There is no list, no slug, no trash and no preview token.
 */

import type { ContentRow } from '@/content/repository/types';
import type { GlobalContentRow, GlobalTableRow } from '@/globals/tables';
import type { JsonObject } from '@/types/index';
import { getDefaultContentLocale } from '@/config/content-locale';
import { createContentRepository } from '@/content/repository/content-table';
import { kyselyTableKey } from '@/database/codec';
import { createRepository } from '@/database/repository/create-repository';
import { globalContentTable, globalsTable, globalVersionsTable } from '@/database/tables';
import { createLazyRegistry } from '@/registry';

/** One locale of one global, as the globals service reads it. */
export type GlobalRow = ContentRow & { key: string };

export type GlobalRepository = ReturnType<typeof createGlobalRepository>;

/** The two joined rows plus the locale list, in the shape the service reads. */
function toGlobalRow(
    global: GlobalTableRow,
    content: GlobalContentRow,
    locales: string[]
): GlobalRow {
    return {
        id: content.globalId,
        contentId: content.id as GlobalRow['contentId'],
        key: global.key,
        locale: content.locale,
        locales,
        staged: content.stagedFor !== null,
        fields: (content.fields ?? {}) as JsonObject,
        status: content.status,
        publishedAt: content.publishedAt,
        createdAt: global.createdAt,
        updatedAt: content.updatedAt,
        createdBy: content.createdBy,
        updatedBy: content.updatedBy,
    };
}

/**
 * Every handle and the default locale resolve per call, so the one registered
 * repository follows a transaction scope and a config reload.
 */
function createGlobalRepository() {
    const owners = createRepository(globalsTable);
    const content = createContentRepository(
        {
            table: globalsTable,
            contentTable: globalContentTable,
            versionsTable: globalVersionsTable,
            ownerColumn: 'globalId',
        },
        { decode: toGlobalRow }
    );

    const ownerKey = kyselyTableKey(globalsTable.name);
    const contentKey = kyselyTableKey(globalContentTable.name);

    /**
     * The canonical row of the global saved under `key`, in `locale` (the
     * default when absent), or null. No fallback to another locale.
     */
    async function findByKey(key: string, locale?: string): Promise<GlobalRow | null> {
        const raw = await content
            .kysely()
            .joined()
            .where((eb) =>
                eb.and([
                    eb(`${ownerKey}.key`, '=', key),
                    eb(`${contentKey}.locale`, '=', locale ?? getDefaultContentLocale()),
                    eb(`${contentKey}.stagedFor`, 'is', null),
                ])
            )
            .executeTakeFirst();
        const [row] = await content.decodeRows(raw ? [raw] : []);
        return row ?? null;
    }

    /**
     * The `globals.id` for `key`, or null when nothing is saved yet. For a
     * write to a locale with no row, and for the staged read.
     */
    async function findIdByKey(key: string): Promise<string | null> {
        const row = await owners.findOne({ key });
        return row?.id ?? null;
    }

    return {
        findByKey,
        findIdByKey,
        findOne: content.findOne,
        create: content.create,
        update: content.update,
        staging: content.staging,
        versions: content.versions,
        translatable: content.translatable,
        findStoredRows: content.findStoredRows,
    };
}

const globalRepository = createLazyRegistry<GlobalRepository>(
    'globalRepository',
    createGlobalRepository
);

/** The globals repository, built on first use. */
export function getGlobalRepository(): GlobalRepository {
    return globalRepository.get();
}

/**
 * Swap the globals repository, so a test can replace one method.
 * @internal
 */
export function setGlobalRepository(repository: GlobalRepository): void {
    globalRepository.set(repository);
}
