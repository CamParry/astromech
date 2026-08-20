/**
 * Media service method contracts — declared permission + effect per verb.
 * `input` is the method's argument object, not the HTTP body: `media.update`
 * is called `update({ id, data })`, composing the body schema into that shape.
 */

import type { ServiceMethodContract } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { mediaQuerySchema, updateMediaSchema } from './schema';

export const mediaContract = {
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
        // `unrepresentable: 'any'` degrades it to `{}` rather than throwing, so
        // the emitted schema looks callable and isn't. `binaryInput` is what
        // says so out loud; a JSON-RPC transport skips the method by that flag
        // rather than by keeping its own list of exceptions.
        input: z.object({ file: z.instanceof(File) }),
        binaryInput: true,
        permission: 'media:upload',
        mutates: true,
    },
    replace: {
        summary: 'Replace a media item’s file, keeping its id, URL and metadata.',
        input: z.object({ id: z.string(), file: z.instanceof(File) }),
        binaryInput: true,
        permission: 'media:upload',
        mutates: true,
        destructive: true,
    },
    update: {
        summary:
            'Update a media item’s metadata. Fields merge: omitted fields keep ' +
            'their current value, and arrays are replaced whole.',
        input: z.object({ id: z.string(), data: updateMediaSchema }),
        permission: 'media:update',
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
    usedBy: {
        summary: 'List the entries, users and media items that reference a media item.',
        input: z.object({ id: z.string() }),
        permission: 'media:read',
        mutates: false,
    },
} satisfies Record<string, ServiceMethodContract>;
