/**
 * Globals service — the verbs a global offers, reached as `app.globals`. A thin
 * assembler: it wires `methods/**` into the `GlobalsService` definition, and
 * every policy lives there or in `internal/**`.
 */

import type { GlobalsService } from '@/types/index';
import { defineService } from '@/services/define-service';
import { getGlobal } from './methods/get';
import { createStagedGlobal } from './methods/staging/create';
import { deleteStagedGlobal } from './methods/staging/delete';
import { getStagedGlobal } from './methods/staging/get';
import { mergeStagedGlobal } from './methods/staging/merge';
import { publishGlobal, scheduleGlobal, unpublishGlobal } from './methods/status';
import { updateGlobal } from './methods/update';
import { listGlobalVersions } from './methods/versions/list';
import { restoreGlobalVersion } from './methods/versions/restore';

export const globalsDefinition = defineService<GlobalsService>('globals', {
    get: getGlobal,
    update: updateGlobal,
    publish: publishGlobal,
    unpublish: unpublishGlobal,
    schedule: scheduleGlobal,
    versions: listGlobalVersions,
    restoreVersion: restoreGlobalVersion,
    createStaged: createStagedGlobal,
    getStaged: getStagedGlobal,
    mergeStaged: mergeStagedGlobal,
    deleteStaged: deleteStagedGlobal,
});
