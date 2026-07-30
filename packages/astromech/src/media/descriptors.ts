/**
 * Media service method descriptors — declared permission + effect per media verb.
 * The single source the HTTP transport enforces against and the manifest reads.
 *
 * `input` is the METHOD's argument object, not the HTTP body: `media.update` is
 * called `update({ id, data })`, so the descriptor composes the body schema into
 * that shape rather than declaring the body alone.
 */

import { z } from '@hono/zod-openapi';
import type { ServiceMethodDescriptor } from '@/types/index.js';
import { mediaQuerySchema, updateMediaSchema } from './schema.js';

export const mediaDescriptors = {
    query: {
        summary: 'List media items.',
        input: mediaQuerySchema,
        permission: 'media:read',
        mutates: false,
    },
    get: {
        summary: 'Read one media item by id.',
        input: z.object({ id: z.string() }),
        permission: 'media:read',
        mutates: false,
    },
    upload: {
        summary: 'Upload a new media file.',
        // `File` has no JSON Schema representation — the manifest generator's
        // `unrepresentable: 'any'` degrades it to `{}` rather than throwing.
        input: z.object({ file: z.instanceof(File) }),
        permission: 'media:upload',
        mutates: true,
    },
    update: {
        summary: 'Update a media item’s metadata.',
        input: z.object({ id: z.string(), data: updateMediaSchema }),
        permission: 'media:upload',
        mutates: true,
        idempotent: true,
    },
    delete: {
        summary: 'Delete a media item.',
        input: z.object({ id: z.string() }),
        permission: 'media:delete',
        mutates: true,
        destructive: true,
    },
} satisfies Record<string, ServiceMethodDescriptor>;
