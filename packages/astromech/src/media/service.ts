/**
 * Media service — the media CRUD verbs. A thin assembler: it wires `methods/**`
 * into the `MediaService` definition, and all policy lives there or in
 * `internal/**`. Consumers reach the bound form as `app.media`.
 */

import type { MediaService } from '@/types/index';
import { defineService } from '@/services/define-service';
import { deleteMedia } from './methods/delete';
import { getMedia } from './methods/get';
import { queryMedia } from './methods/query';
import { replaceMedia } from './methods/replace';
import { updateMedia } from './methods/update';
import { uploadMedia } from './methods/upload';
import { listMediaUsage } from './methods/used-by';
import { listMediaVersions } from './methods/versions/list';
import { restoreMediaVersion } from './methods/versions/restore';

export const mediaDefinition = defineService<MediaService>('media', {
    query: queryMedia,
    get: getMedia,
    upload: uploadMedia,
    update: updateMedia,
    delete: deleteMedia,
    replace: replaceMedia,
    usedBy: listMediaUsage,
    versions: listMediaVersions,
    restoreVersion: restoreMediaVersion,
});
