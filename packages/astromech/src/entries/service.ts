/**
 * Entries service — the entry CRUD verbs, reached as `app.entries`. A thin
 * assembler: it wires `methods/**` into the `EntriesService` definition, and
 * every policy lives there or in `internal/**`.
 */

import type { Capability } from './capabilities';
import type { EntriesService } from './service-types';
import { defineService } from '@/services/define-service';
import { assertTypeCapability } from './capabilities';
import { typeOf } from './internal/access';
import { countEntries } from './methods/count';
import { createEntry } from './methods/create';
import { deleteEntries } from './methods/delete';
import { duplicateEntry } from './methods/duplicate';
import { emptyTrash } from './methods/empty-trash';
import { getEntry } from './methods/get';
import { issuePreviewToken } from './methods/preview/issue-token';
import { revokePreviewToken } from './methods/preview/revoke-token';
import { publishEntries } from './methods/publish';
import { queryEntries } from './methods/query';
import { restoreEntries } from './methods/restore';
import { scheduleEntries } from './methods/schedule';
import { createStagedEntry } from './methods/staging/create';
import { deleteStagedEntry } from './methods/staging/delete';
import { getStagedEntry } from './methods/staging/get';
import { mergeStagedEntry } from './methods/staging/merge';
import { trashEntries } from './methods/trash';
import { unpublishEntries } from './methods/unpublish';
import { updateEntries } from './methods/update';
import { listEntryUsage } from './methods/used-by';
import { getEntryVersion } from './methods/versions/get';
import { listEntryVersions } from './methods/versions/list';
import { restoreEntryVersion } from './methods/versions/restore';

export const entriesDefinition = defineService<EntriesService>(
    'entries',
    {
        query: queryEntries,
        count: countEntries,
        get: getEntry,
        create: createEntry,
        update: updateEntries,
        duplicate: duplicateEntry,
        trash: trashEntries,
        restore: restoreEntries,
        delete: deleteEntries,
        emptyTrash,
        versions: listEntryVersions,
        getVersion: getEntryVersion,
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
