/**
 * Media service — the media CRUD verbs. Thin assembler: wires the
 * per-operation functions in `operations/**` into the public `MediaService`
 * object. All policy lives in `operations/**` + `internal/**`.
 */

import type { MediaService } from '@/types/index';
import { deleteMedia } from './operations/delete';
import { getMedia } from './operations/get';
import { queryMedia } from './operations/query';
import { replaceMedia } from './operations/replace';
import { updateMedia } from './operations/update';
import { uploadMedia } from './operations/upload';
import { listMediaUsage } from './operations/used-by';
import { listMediaVersions } from './operations/versions/list';
import { restoreMediaVersion } from './operations/versions/restore';

export const mediaService: MediaService = {
    query: queryMedia,
    get: getMedia,
    upload: uploadMedia,
    update: updateMedia,
    delete: deleteMedia,
    replace: replaceMedia,
    usedBy: listMediaUsage,
    versions: listMediaVersions,
    restoreVersion: restoreMediaVersion,
};
