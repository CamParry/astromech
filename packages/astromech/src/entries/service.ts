/**
 * Entries service — the entry CRUD verbs, reached as `app.entries`. A thin
 * assembler: it wires `methods/**` into the `EntriesService` definition, and
 * every policy lives there or in `internal/**`.
 */

import type { EntriesService, Entry, EntryUpdateParams } from '@/types/index';
import { defineService } from '@/services/define-service';
import { createEntry } from './methods/create';
import { deleteEntries } from './methods/delete';
import { duplicateEntry } from './methods/duplicate';
import { getEntry } from './methods/get';
import { issuePreviewToken, revokePreviewToken } from './methods/preview/token';
import { queryEntries } from './methods/query';
import { listIncomingRelationships } from './methods/relationships';
import { restoreEntries } from './methods/restore';
import { createStagedEntry } from './methods/staging/create';
import { deleteStagedEntry } from './methods/staging/delete';
import { getStagedEntry } from './methods/staging/get';
import { mergeStagedEntry } from './methods/staging/merge';
import { publishEntries, scheduleEntries, unpublishEntries } from './methods/status';
import { emptyTrash, trashEntries } from './methods/trash';
import { updateEntries } from './methods/update';
import { listEntryVersions } from './methods/versions/list';
import { restoreEntryVersion } from './methods/versions/restore';

/**
 * `EntriesService` with each overload pair collapsed to its union — the shape
 * the handlers implement. `MethodsFor<S>` reads a method's parameter and result
 * off its LAST overload, so the five that answer an `Entry` for one id and an
 * `Entry[]` for a list have to state both here for the catalogue to be checked
 * against something true. The composition root casts back
 * (`app-context/services.ts`, `app-context/app-context.ts`).
 */
export type EntriesMethods = Omit<
    EntriesService,
    'update' | 'restore' | 'publish' | 'unpublish' | 'schedule'
> & {
    update(params: EntryUpdateParams): Promise<Entry | Entry[]>;
    restore(params: {
        type: string;
        id: string | readonly string[];
    }): Promise<Entry | Entry[]>;
    publish(params: {
        type: string;
        id: string | readonly string[];
        locale?: string;
    }): Promise<Entry | Entry[]>;
    unpublish(params: {
        type: string;
        id: string | readonly string[];
        locale?: string;
    }): Promise<Entry | Entry[]>;
    schedule(params: {
        type: string;
        id: string | readonly string[];
        publishedAt: Date | string;
        locale?: string;
    }): Promise<Entry | Entry[]>;
};

export const entriesDefinition = defineService<EntriesMethods>('entries', {
    query: queryEntries,
    get: getEntry,
    create: createEntry,
    update: updateEntries,
    duplicate: duplicateEntry,
    trash: trashEntries,
    restore: restoreEntries,
    delete: deleteEntries,
    emptyTrash,
    versions: listEntryVersions,
    restoreVersion: restoreEntryVersion,
    publish: publishEntries,
    unpublish: unpublishEntries,
    schedule: scheduleEntries,
    incomingRelationships: listIncomingRelationships,
    createStaged: createStagedEntry,
    getStaged: getStagedEntry,
    mergeStaged: mergeStagedEntry,
    deleteStaged: deleteStagedEntry,
    issuePreviewToken,
    revokePreviewToken,
});
