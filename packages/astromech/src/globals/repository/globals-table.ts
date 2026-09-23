/**
 * The globals repository — the shared content repository over
 * `globals`/`global_content`/`global_versions`, plus the one lookup globals add:
 * a global is addressed by `key`, so a caller resolves the row id from it.
 * There is no list, no slug, no trash and no preview token.
 */

import type { ContentRepository, ContentRow } from '@/content/repository/types';
import type { Db } from '@/database/types';
import type { GlobalContentRow, GlobalRow as GlobalsTableRow } from '@/globals/tables';
import type { JsonObject } from '@/types/index';
import { createContentRepository } from '@/content/repository/content-table';
import { createRepository } from '@/database/repository/create-repository';
import { globalContentTable, globalsTable, globalVersionsTable } from '@/database/tables';

/** One locale of one global, as the globals service reads it. */
export type GlobalRow = ContentRow & { key: string };

export type GlobalsRepository = ContentRepository<
    GlobalRow,
    typeof globalVersionsTable
> & {
    /** The `globals.id` for a config key, or null when nothing is saved yet. */
    idByKey(key: string): Promise<string | null>;
};

/** The two joined rows plus the locale list, in the shape the service reads. */
function toGlobalRow(
    global: GlobalsTableRow,
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
 * Build the globals repository, optionally bound to a specific db handle and
 * default locale. Unbound it resolves the db per operation via `getDb()`.
 */
export function createGlobalsRepository(opts?: {
    db?: Db;
    defaultLocale?: string;
}): GlobalsRepository {
    const dbOverride = opts?.db;
    const globals = createRepository(globalsTable, dbOverride);

    const content = createContentRepository(
        {
            table: globalsTable,
            contentTable: globalContentTable,
            versionsTable: globalVersionsTable,
            ownerColumn: 'globalId',
        },
        {
            ...(dbOverride ? { db: dbOverride } : {}),
            ...(opts?.defaultLocale ? { defaultLocale: opts.defaultLocale } : {}),
            decode: toGlobalRow,
        }
    );

    async function idByKey(key: string): Promise<string | null> {
        const row = await globals.findOne({ key });
        return row?.id ?? null;
    }

    return { ...content, idByKey };
}
