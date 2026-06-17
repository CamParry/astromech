/**
 * Media service method descriptors — declared permission + effect per media verb.
 * The single source the HTTP transport enforces against and the manifest reads.
 */

import type { ServiceMethodDescriptor } from '@/types/index.js';
import { updateMediaSchema } from './schema.js';

export const mediaDescriptors = {
    query: {
        name: 'media.query',
        summary: 'List media items.',
        permission: 'media:read',
        mutates: false,
    },
    get: {
        name: 'media.get',
        summary: 'Read one media item by id.',
        permission: 'media:read',
        mutates: false,
    },
    upload: {
        name: 'media.upload',
        summary: 'Upload a new media file.',
        permission: 'media:upload',
        mutates: true,
    },
    update: {
        name: 'media.update',
        summary: 'Update a media item’s metadata.',
        input: updateMediaSchema,
        permission: 'media:upload',
        mutates: true,
        idempotent: true,
    },
    delete: {
        name: 'media.delete',
        summary: 'Delete a media item.',
        permission: 'media:delete',
        mutates: true,
        destructive: true,
    },
} satisfies Record<string, ServiceMethodDescriptor>;
