/**
 * The globals repository: the shared content repository over
 * `globals`/`global_content`/`global_versions`, read by config `key` rather
 * than by id. There is no list, no slug, no trash and no preview token.
 */

import type { Resource } from '@/content/repository/types';
import type { GlobalContentRow, GlobalTableRow } from '@/globals/tables';
import type { JsonObject } from '@/types/index';
import { getDefaultContentLocale } from '@/config/content-locale';
import { createContentRepository } from '@/content/repository/content-table';
import { kyselyTableKey } from '@/database/codec';
import { createRepository } from '@/database/repository/create-repository';
import { globalContentTable, globalsTable, globalVersionsTable } from '@/database/tables';

/** One locale of one global, as the globals service reads it. */
export type GlobalResource = Resource & { key: string };

export type GlobalRepository = ReturnType<typeof createGlobalRepository>;

/** The two joined rows plus the locale list, as the resource the service reads. */
function toGlobalResource(
    resourceRow: GlobalTableRow,
    contentRow: GlobalContentRow,
    locales: string[]
): GlobalResource {
    return {
        id: contentRow.globalId,
        contentId: contentRow.id as GlobalResource['contentId'],
        key: resourceRow.key,
        locale: contentRow.locale,
        locales,
        staged: contentRow.stagedFor !== null,
        fields: (contentRow.fields ?? {}) as JsonObject,
        status: contentRow.status,
        publishedAt: contentRow.publishedAt,
        createdAt: resourceRow.createdAt,
        updatedAt: contentRow.updatedAt,
        createdBy: contentRow.createdBy,
        updatedBy: contentRow.updatedBy,
    };
}

/**
 * Every handle and the default locale resolve per call, so the one registered
 * repository follows a transaction scope and a config reload.
 */
function createGlobalRepository() {
    const resourceRows = createRepository(globalsTable);
    const content = createContentRepository(
        {
            table: globalsTable,
            contentTable: globalContentTable,
            versionsTable: globalVersionsTable,
            resourceIdColumn: 'globalId',
        },
        { decode: toGlobalResource }
    );

    const resourceKey = kyselyTableKey(globalsTable.name);
    const contentKey = kyselyTableKey(globalContentTable.name);

    /**
     * The global saved under `key`, read from its canonical content row in
     * `locale` (the default when absent), or null. No fallback to another locale.
     */
    async function findByKey(
        key: string,
        locale?: string
    ): Promise<GlobalResource | null> {
        const raw = await content
            .kysely()
            .joined()
            .where((eb) =>
                eb.and([
                    eb(`${resourceKey}.key`, '=', key),
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
        const row = await resourceRows.findOne({ key });
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

/** The globals repository. Stateless: every handle and the default locale resolve per call. */
export const globalRepository = createGlobalRepository();
