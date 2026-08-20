/**
 * Media service — the media CRUD verbs. Thin assembler: wires the
 * per-operation functions in `operations/**` into the public `MediaService`
 * object. All policy lives in `operations/**` + `internal/**`.
 */

import type { MediaService } from '@/types/index';
import { deleteMedia } from './operations/delete';
import { get } from './operations/get';
import { query } from './operations/query';
import { replace } from './operations/replace';
import { update } from './operations/update';
import { upload } from './operations/upload';
import { usedBy } from './operations/used-by';

export const mediaService: MediaService = {
    query,
    get,
    upload,
    update,
    delete: deleteMedia,
    replace,
    usedBy,
};
