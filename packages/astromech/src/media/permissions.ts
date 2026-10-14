/**
 * Media permissions: the actions, the builder for `media:{action}` strings, and
 * the declarations. Pure, so the admin reaches the builder through
 * `astromech/shared`.
 */

import type { PermissionDeclaration } from '@/permissions/permission';

/** The actions a media permission gates. `upload` covers adding and replacing a file. */
export const MEDIA_ACTIONS = ['read', 'upload', 'update', 'delete'] as const;

/** One of {@link MEDIA_ACTIONS}. */
export type MediaAction = (typeof MEDIA_ACTIONS)[number];

/** The permission `action` on the media library checks, e.g. `media:upload`. */
export function mediaPermission<A extends MediaAction>(action: A): `media:${A}` {
    return `media:${action}`;
}

/** Every media permission core declares, one per action. */
export const MEDIA_PERMISSIONS = {
    'media:read': { label: 'View media' },
    'media:upload': {
        label: 'Upload media',
        description: 'Add new files to the media library.',
    },
    'media:update': {
        label: 'Update media',
        description: "Edit an existing item's alt text, title and caption.",
    },
    'media:delete': { label: 'Delete media' },
} satisfies Record<`media:${MediaAction}`, PermissionDeclaration>;
