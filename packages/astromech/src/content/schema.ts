/** The output schemas the content modules share: a `usedBy` row. */

import { z } from '@hono/zod-openapi';
import { fallback } from '@/services/fallback';
import { RESOURCE_TYPES } from '@/types/domain';

/**
 * One reference in the relationships index pointing at a resource: a row of a
 * `usedBy` answer, which the delete check and the media "used by" panel read.
 */
export const usageSchema = z
    .object({
        sourceId: z.string(),
        /** Display name of the source; empty when it could not be loaded. */
        sourceTitle: z.string(),
        /** What holds the reference. */
        sourceKind: z.enum(RESOURCE_TYPES),
        /**
         * An entry source's type (qualified for a plugin type) or a global source's
         * key. Null for user and media sources.
         */
        sourceType: z.string().nullable().catch(fallback(null)),
        /** Schema path of the field holding the reference (`sections[].gallery`). */
        schemaPath: z.string(),
        /** Instance path, which deep-links to the exact item. Never pattern-matched. */
        instancePath: z.string(),
        /** True when only the source's staged (pending-merge) change holds it. */
        sourceStaged: z.boolean(),
    })
    .openapi('Usage');
