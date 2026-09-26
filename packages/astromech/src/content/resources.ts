/**
 * One spec per resource: what the shared helpers in `content/` read to treat an
 * entry, a global, a user and a media item alike. What the four do not share
 * stays in each module; `DECISIONS.md` says why the spec holds no repository.
 */

import type {
    Field,
    ResolvedConfig,
    ResourceType,
    ResourceValidator,
} from '@/types/index';
import type { z } from 'zod';
import { resolveEntryType } from '@/entries/entry-types';
import { entrySchema } from '@/entries/schema';
import { resolveGlobal } from '@/globals/resolve-global';
import { globalSchema } from '@/globals/schema';
import { mediaSchema } from '@/media/schema';
import { MEDIA_SORT_FIELDS } from '@/types/query';
import { userSchema } from '@/users/schema';

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
    /** Whether the target carries a publication status, so a draft may be partial. */
    hasStatuses(config: ResolvedConfig, target?: string): boolean;
    /** The author's whole-resource validator for the target, when it declares one. */
    validate(config: ResolvedConfig, target?: string): ResourceValidator | undefined;
    /** The columns a list may order by; empty for a resource with no list. */
    sortable: readonly string[];
    /** The content columns a version snapshots beside `fields`. */
    versionedColumns: readonly string[];
    /** The public shape one resource is read in: the output schema of its `get`. */
    outputSchema: z.ZodType;
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
        // A type no longer configured keeps its rows; they validate as drafts
        // of a type with statuses, which is the default.
        hasStatuses: (config, type) =>
            resolveEntryType(config, type ?? '')?.capabilities.statuses !== false,
        validate: (config, type) => resolveEntryType(config, type ?? '')?.validate,
        sortable: ['title', 'status', 'createdAt', 'updatedAt', 'publishedAt', 'slug'],
        versionedColumns: ['title', 'slug'],
        outputSchema: entrySchema,
    },
    global: {
        kind: 'global',
        name: (key) => `Global '${key ?? ''}'`,
        fields: (config, key) => {
            const global = resolveGlobal(config, key ?? '');
            return global ? [...global.fields.main, ...global.fields.sidebar] : [];
        },
        translatable: (config, key) =>
            resolveGlobal(config, key ?? '')?.capabilities.translatable === true,
        hasStatuses: (config, key) =>
            resolveGlobal(config, key ?? '')?.capabilities.statuses === true,
        validate: (config, key) => resolveGlobal(config, key ?? '')?.validate,
        sortable: [],
        versionedColumns: [],
        outputSchema: globalSchema,
    },
    user: {
        kind: 'user',
        name: () => 'User content',
        fields: (config) => config.users.fields,
        translatable: (config) => config.users.translatable,
        hasStatuses: () => false,
        validate: (config) => config.users.validate,
        sortable: ['name', 'email', 'createdAt', 'updatedAt', 'role'],
        versionedColumns: [],
        outputSchema: userSchema,
    },
    media: {
        kind: 'media',
        name: () => 'Media',
        fields: (config) => config.media.fields ?? [],
        translatable: (config) => config.media.translatable,
        hasStatuses: () => false,
        validate: (config) => config.media.validate,
        sortable: MEDIA_SORT_FIELDS,
        versionedColumns: ['title', 'alt', 'caption'],
        outputSchema: mediaSchema,
    },
};
