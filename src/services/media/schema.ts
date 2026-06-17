import { z } from '@hono/zod-openapi';

export const updateMediaSchema = z.object({
    alt: z.string().optional(),
    title: z.string().optional(),
    fields: z.record(z.string(), z.unknown()).optional(),
}).openapi('UpdateMedia');
