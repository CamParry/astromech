/**
 * Globals service — the verbs a global offers, reached as `app.globals`. A thin
 * assembler: it wires `methods/**` into the `GlobalsService` definition, and
 * every policy lives there or in `internal/**`.
 */

import type { GlobalsService } from './service-types';
import { defineService } from '@/services/define-service';
import { assertRequiredCapability } from './capabilities';
import { getGlobal } from './methods/get';
import { publishGlobal } from './methods/publish';
import { scheduleGlobal } from './methods/schedule';
import { createStagedGlobal } from './methods/staging/create';
import { deleteStagedGlobal } from './methods/staging/delete';
import { getStagedGlobal } from './methods/staging/get';
import { mergeStagedGlobal } from './methods/staging/merge';
import { unpublishGlobal } from './methods/unpublish';
import { updateGlobal } from './methods/update';
import { getGlobalVersion } from './methods/versions/get';
import { listGlobalVersions } from './methods/versions/list';
import { restoreGlobalVersion } from './methods/versions/restore';

export const globalsDefinition = defineService<GlobalsService>(
    'globals',
    {
        get: getGlobal,
        update: updateGlobal,
        publish: publishGlobal,
        unpublish: unpublishGlobal,
        schedule: scheduleGlobal,
        versions: listGlobalVersions,
        getVersion: getGlobalVersion,
        restoreVersion: restoreGlobalVersion,
        createStaged: createStagedGlobal,
        getStaged: getStagedGlobal,
        mergeStaged: mergeStagedGlobal,
        deleteStaged: deleteStagedGlobal,
    },
    {
        assertRequires: (capability, input, ctx) =>
            assertRequiredCapability(ctx.config, input, capability),
    }
);
