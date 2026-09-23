/**
 * One spec per resource: what the shared helpers in `content/` read to treat an
 * entry, a global, a user and a media item alike. What the four do not share
 * stays in each module; `DECISIONS.md` says why the spec holds no repository.
 */

import type { Field, ResolvedConfig, ResourceType } from '@/types/index';
import { resolveEntryType } from '@/entries/entry-types';
import { findGlobal } from '@/globals/find-global';
import { MEDIA_SORT_FIELDS } from '@/types/query';

/**
 * A resource as the shared helpers see it. `target` names the entry type or the
 * global's key where a call has one; users and media ignore it.
 */
export type ResourceSpec = {
    kind: ResourceType;
    /** How a message names the target: `Entry type 'post'`, `Media`. */
    name(target?: string): string;
    /** The target's field tree, layout fields included; empty when nothing declares it. */
    fields(config: ResolvedConfig, target?: string): Field[];
    /** Whether the target keeps a content row per locale. */
    translatable(config: ResolvedConfig, target?: string): boolean;
    /** The columns a list may order by; empty for a resource with no list. */
    sortable: readonly string[];
    /** The content columns a version snapshots beside `fields`. */
    versionedColumns: readonly string[];
};

/** Every resource's spec, keyed by kind, so a missing resource is a type error. */
export const RESOURCE_SPECS: {
    readonly [K in ResourceType]: ResourceSpec & { kind: K };
} = {
    entry: {
        kind: 'entry',
        name: (type) => `Entry type '${type ?? ''}'`,
        fields: (config, type) => {
            const entryType = resolveEntryType(config, type ?? '');
            return entryType
                ? [...entryType.fields.main, ...entryType.fields.sidebar]
                : [];
        },
        translatable: (config, type) =>
            resolveEntryType(config, type ?? '')?.translatable === true,
        sortable: ['title', 'status', 'createdAt', 'updatedAt', 'publishedAt', 'slug'],
        versionedColumns: ['title', 'slug'],
    },
    global: {
        kind: 'global',
        name: (key) => `Global '${key ?? ''}'`,
        fields: (config, key) => {
            const global = findGlobal(config, key ?? '');
            return global ? [...global.fields.main, ...global.fields.sidebar] : [];
        },
        translatable: (config, key) =>
            findGlobal(config, key ?? '')?.capabilities.translatable === true,
        sortable: [],
        versionedColumns: [],
    },
    user: {
        kind: 'user',
        name: () => 'User content',
        fields: (config) => config.users.fields,
        translatable: (config) => config.users.translatable,
        sortable: ['name', 'email', 'createdAt', 'updatedAt', 'role'],
        versionedColumns: [],
    },
    media: {
        kind: 'media',
        name: () => 'Media',
        fields: (config) => config.media.fields ?? [],
        translatable: (config) => config.media.translatable,
        sortable: MEDIA_SORT_FIELDS,
        versionedColumns: ['title', 'alt', 'caption'],
    },
};
