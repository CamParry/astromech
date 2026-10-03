/** What an admin route declares about the thing the user is currently looking at. */

import { z } from '@hono/zod-openapi';

const aiContextKindSchema = z.enum(['entries', 'globals', 'media', 'users', 'pages']);

export type AiContextKind = z.infer<typeof aiContextKindSchema>;

const aiContextReferenceSchema = z.object({
    kind: aiContextKindSchema,
    /** Entry type id, bare (`posts`) or qualified (`forms/form`). Entries only. */
    type: z.string().optional(),
    /** Identifier of the single item in view — a global's `key`. Absent on list and index screens. */
    id: z.string().optional(),
    /** Human label for the subject, already resolved by the route. */
    label: z.string(),
});

export type AiContextReference = z.infer<typeof aiContextReferenceSchema>;

/**
 * A declared reference with its position: lower `depth` is less specific. A
 * plugin that receives items over the wire parses them with this schema.
 */
export const aiContextItemSchema = z.object({
    reference: aiContextReferenceSchema,
    depth: z.number(),
    order: z.number(),
});

export type AiContextItem = z.infer<typeof aiContextItemSchema>;
