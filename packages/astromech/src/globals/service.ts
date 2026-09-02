/**
 * Globals service — the verbs a global offers, reached as `app.globals`. A thin
 * assembler: it wires `operations/**` into the public `GlobalsService` object,
 * and every policy lives there or in `internal/**`.
 */

import type { GlobalsService } from '@/types/index';
import { getGlobal } from './operations/get';
import { createStagedGlobal } from './operations/staging/create';
import { deleteStagedGlobal } from './operations/staging/delete';
import { getStagedGlobal } from './operations/staging/get';
import { mergeStagedGlobal } from './operations/staging/merge';
import { publishGlobal, scheduleGlobal, unpublishGlobal } from './operations/status';
import { updateGlobal } from './operations/update';
import { listGlobalVersions } from './operations/versions/list';
import { restoreGlobalVersion } from './operations/versions/restore';

export const globalsService: GlobalsService = {
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
};
