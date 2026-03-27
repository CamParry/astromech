import { z } from '@hono/zod-openapi';

export const entryStatusEnum = z.enum(['draft', 'published', 'scheduled']);

const slugField = z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase alphanumeric with hyphens')
    .optional();

const publishAtField = z
    .union([z.date(), z.string().datetime({ offset: true }).transform(v => new Date(v))])
    .nullable()
    .optional();

export const createEntrySchema = z.object({
    title: z.string().min(1, 'Title is required').openapi({ example: 'My Post' }),
    slug: slugField,
    fields: z.record(z.string(), z.unknown()).optional().openapi({ example: { body: 'Hello world' } }),
    status: entryStatusEnum.optional(),
    publishAt: publishAtField,
}).openapi('CreateEntry');

export const updateEntrySchema = z.object({
    title: z.string().min(1, 'Title cannot be empty').optional(),
    slug: slugField,
    fields: z.record(z.string(), z.unknown()).optional(),
    status: entryStatusEnum.optional(),
    publishAt: publishAtField,
}).openapi('UpdateEntry');

export const scheduleEntrySchema = z.object({
    publishAt: z.union([
        z.date(),
        z.string().datetime({ offset: true }).transform(v => new Date(v)),
    ]),
});

export const createTranslationSchema = z.object({
    locale: z.string().min(1, 'Locale is required'),
    copyFields: z.boolean().optional(),
});
