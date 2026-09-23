/**
 * Entries service — the entry CRUD verbs, reached as `app.entries`. A thin
 * assembler: it wires `methods/**` into the `EntriesService` definition, and
 * every policy lives there or in `internal/**`.
 */

import type { Capability } from './capabilities';
import type { EntriesService } from '@/types/index';
import { defineService } from '@/services/define-service';
import { assertTypeCapability, typeOf } from './internal/entry-type';
import { createEntry } from './methods/create';
import { deleteEntries } from './methods/delete';
import { duplicateEntry } from './methods/duplicate';
import { getEntry } from './methods/get';
import { issuePreviewToken, revokePreviewToken } from './methods/preview/token';
import { queryEntries } from './methods/query';
import { restoreEntries } from './methods/restore';
import { createStagedEntry } from './methods/staging/create';
import { deleteStagedEntry } from './methods/staging/delete';
import { getStagedEntry } from './methods/staging/get';
import { mergeStagedEntry } from './methods/staging/merge';
import { publishEntries, scheduleEntries, unpublishEntries } from './methods/status';
import { emptyTrash, trashEntries } from './methods/trash';
import { updateEntries } from './methods/update';
import { listEntryUsage } from './methods/used-by';
import { listEntryVersions } from './methods/versions/list';
import { restoreEntryVersion } from './methods/versions/restore';

export const entriesDefinition = defineService<EntriesService>(
    'entries',
    {
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
        usedBy: listEntryUsage,
        createStaged: createStagedEntry,
        getStaged: getStagedEntry,
        mergeStaged: mergeStagedEntry,
        deleteStaged: deleteStagedEntry,
        issuePreviewToken,
        revokePreviewToken,
    },
    {
        assertRequires: (capability, input, ctx) =>
            assertTypeCapability(ctx.config, typeOf(input), capability as Capability),
    }
);
