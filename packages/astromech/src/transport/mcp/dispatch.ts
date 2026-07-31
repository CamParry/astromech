/**
 * MCP Tool Dispatch
 *
 * Builds a ToolDispatch descriptor from a ManifestMethod. Returns null for
 * methods without a v1 adapter (plugin methods, binary-upload methods, and
 * long-tail entries actions).
 *
 * A tool's `inputSchema` is ALWAYS the manifest's serialised method input. The
 * adapters below choose which service method to call and how to shape its
 * arguments; they do not describe it. Hand-written schema literals here are what
 * let `users_update` advertise a shape the method had not accepted for months.
 */

import type { usersApi } from '@/users/service.js';
import type { mediaApi } from '@/media/service.js';
import type { settingsApi } from '@/settings/service.js';
import type { entries } from '@/entries/service.js';
import type {
    CoreManifestMethod,
    EntriesManifestMethod,
    JsonSchemaObject,
    ManifestMethod,
} from '@/types/index.js';

// ============================================================================
// Types
// ============================================================================

/** Annotations carried on a tool definition. */
export type ToolAnnotations = {
    title?: string;
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
};

/**
 * A fully-resolved dispatch descriptor for a single MCP tool.
 */
export type ToolDispatch = {
    toolName: string;
    description: string;
    inputSchema: JsonSchemaObject;
    annotations: ToolAnnotations;
    invoke: (args: Record<string, unknown>) => Promise<unknown>;
};

// ============================================================================
// Lazy service accessors — imported here; called only at runtime
// ============================================================================

// These are imported dynamically rather than at module-level so they don't
// pull in the full services tree until the MCP server actually starts.
async function getUsersApi(): Promise<typeof usersApi> {
    const mod = await import('@/users/service.js');
    return mod.usersApi;
}

async function getMediaApi(): Promise<typeof mediaApi> {
    const mod = await import('@/media/service.js');
    return mod.mediaApi;
}

async function getSettingsApi(): Promise<typeof settingsApi> {
    const mod = await import('@/settings/service.js');
    return mod.settingsApi;
}

async function getEntries(): Promise<typeof entries> {
    const mod = await import('@/entries/service.js');
    return mod.entries;
}

// ============================================================================
// Core — users adapters
// ============================================================================

function buildUsersAdapter(
    manifest: CoreManifestMethod,
    inputSchema: JsonSchemaObject
): ToolDispatch | null {
    const action = manifest.method;
    const base = {
        toolName: `users_${action}`,
        description: manifest.summary ?? `${action} user`,
        inputSchema,
        annotations: {
            title: `Users: ${action}`,
            readOnlyHint: !manifest.mutates,
            destructiveHint: manifest.destructive,
            idempotentHint: manifest.idempotent,
        },
    };

    switch (action) {
        case 'query':
            return {
                ...base,
                invoke: async (args) => {
                    const api = await getUsersApi();
                    return api.query(args as Parameters<typeof usersApi.query>[0]);
                },
            };

        case 'get':
            return {
                ...base,
                invoke: async (args) => {
                    const api = await getUsersApi();
                    return api.get({ id: args['id'] as string });
                },
            };

        case 'create':
            return {
                ...base,
                invoke: async (args) => {
                    const api = await getUsersApi();
                    return api.create(args as Parameters<typeof usersApi.create>[0]);
                },
            };

        case 'update':
            return {
                ...base,
                invoke: async (args) => {
                    const api = await getUsersApi();
                    return api.update(args as Parameters<typeof usersApi.update>[0]);
                },
            };

        case 'delete':
            return {
                ...base,
                invoke: async (args) => {
                    const api = await getUsersApi();
                    return api.delete({ id: args['id'] as string });
                },
            };

        default:
            return null;
    }
}

// ============================================================================
// Core — settings adapters
// ============================================================================

function buildSettingsAdapter(
    manifest: CoreManifestMethod,
    inputSchema: JsonSchemaObject
): ToolDispatch | null {
    const action = manifest.method;
    const base = {
        toolName: `settings_${action}`,
        description: manifest.summary ?? `${action} settings`,
        inputSchema,
        annotations: {
            title: `Settings: ${action}`,
            readOnlyHint: !manifest.mutates,
            destructiveHint: manifest.destructive,
            idempotentHint: manifest.idempotent,
        },
    };

    switch (action) {
        case 'all':
            return {
                ...base,
                invoke: async (args) => {
                    const api = await getSettingsApi();
                    return api.all(args as Parameters<typeof settingsApi.all>[0]);
                },
            };

        case 'get':
            return {
                ...base,
                invoke: async (args) => {
                    const api = await getSettingsApi();
                    const { key, locale, full } = args as {
                        key: string;
                        locale?: string;
                        full?: boolean;
                    };
                    return api.get({
                        key,
                        ...(locale !== undefined && { locale }),
                        ...(full !== undefined && { full }),
                    });
                },
            };

        case 'set':
            return {
                ...base,
                invoke: async (args) => {
                    const api = await getSettingsApi();
                    const { key, value } = args as { key: string; value: unknown };
                    return api.set({
                        key,
                        value: value as Parameters<typeof settingsApi.set>[0]['value'],
                    });
                },
            };

        default:
            return null;
    }
}

// ============================================================================
// Core — media adapters
// ============================================================================

function buildMediaAdapter(
    manifest: CoreManifestMethod,
    inputSchema: JsonSchemaObject
): ToolDispatch | null {
    const action = manifest.method;
    const base = {
        toolName: `media_${action}`,
        description: manifest.summary ?? `${action} media`,
        inputSchema,
        annotations: {
            title: `Media: ${action}`,
            readOnlyHint: !manifest.mutates,
            destructiveHint: manifest.destructive,
            idempotentHint: manifest.idempotent,
        },
    };

    switch (action) {
        case 'query':
            return {
                ...base,
                invoke: async (args) => {
                    const api = await getMediaApi();
                    return api.query(args as Parameters<typeof mediaApi.query>[0]);
                },
            };

        case 'get':
            return {
                ...base,
                invoke: async (args) => {
                    const api = await getMediaApi();
                    return api.get({ id: args['id'] as string });
                },
            };

        case 'delete':
            return {
                ...base,
                invoke: async (args) => {
                    const api = await getMediaApi();
                    return api.delete({ id: args['id'] as string });
                },
            };

        // upload/replace require File — skip in v1
        default:
            return null;
    }
}

// ============================================================================
// Entries adapters
// ============================================================================

/**
 * Every entries tool pins its own type id — the id the SERVICE is called with,
 * which is qualified (`redirects/redirect`) for a plugin-mounted type. Pinned
 * last so a client cannot redirect the call at another type by passing one.
 */
function withType<T>(args: Record<string, unknown>, typeId: string): T {
    return { ...args, type: typeId } as T;
}

function buildEntriesAdapter(
    manifest: EntriesManifestMethod,
    inputSchema: JsonSchemaObject
): ToolDispatch | null {
    const { method: action, entryType, mount, typeId } = manifest;

    // Tool name: entries_<mount>_<type>_<action> when mount !== 'root',
    // otherwise entries_<type>_<action>.
    const toolName =
        mount !== 'root'
            ? `entries_${mount}_${entryType}_${action}`
            : `entries_${entryType}_${action}`;

    const base = {
        toolName,
        description: manifest.summary ?? `${action} ${entryType} entry`,
        inputSchema,
        annotations: {
            title: `${entryType}: ${action}`,
            readOnlyHint: !manifest.mutates,
            destructiveHint: manifest.destructive,
            idempotentHint: manifest.idempotent,
        },
    };

    switch (action) {
        case 'query':
            return {
                ...base,
                invoke: async (args) => {
                    const svc = await getEntries();
                    return svc.query(withType(args, typeId));
                },
            };

        case 'get':
            return {
                ...base,
                invoke: async (args) => {
                    const svc = await getEntries();
                    return svc.get(withType(args, typeId));
                },
            };

        case 'create':
            return {
                ...base,
                invoke: async (args) => {
                    const svc = await getEntries();
                    return svc.create(withType(args, typeId));
                },
            };

        case 'update':
            return {
                ...base,
                invoke: async (args) => {
                    const svc = await getEntries();
                    return svc.update(withType(args, typeId));
                },
            };

        case 'publish':
            return {
                ...base,
                invoke: async (args) => {
                    const svc = await getEntries();
                    return svc.publish(withType(args, typeId));
                },
            };

        // No descriptor declares `entries.unpublish` yet, so the manifest never
        // emits it and this arm is currently unreachable — kept so adding the
        // descriptor is all it takes to expose the tool.
        case 'unpublish':
            return {
                ...base,
                invoke: async (args) => {
                    const svc = await getEntries();
                    return svc.unpublish(withType(args, typeId));
                },
            };

        case 'delete':
            return {
                ...base,
                invoke: async (args) => {
                    const svc = await getEntries();
                    return svc.delete(withType(args, typeId));
                },
            };

        // duplicate/trash/restore/emptyTrash/versions/restoreVersion/schedule,
        // and the staged-entry methods → skip v1
        default:
            return null;
    }
}

// ============================================================================
// Public builder
// ============================================================================

/**
 * Build a ToolDispatch from a ManifestMethod. Returns null when no v1 adapter
 * exists for this method (plugin methods, binary uploads, entries long-tail).
 *
 * The manifest carries `source`, `domain` and `method` as fields, so nothing
 * here re-derives them by splitting a name apart.
 */
export function buildDispatch(manifest: ManifestMethod): ToolDispatch | null {
    if (manifest.source === 'plugin') {
        return null;
    }

    // Resolved once, here, so no adapter can substitute a literal: a method with
    // no serialisable input cannot be honestly described to a client, so it is
    // skipped rather than given a hand-written stand-in that drifts.
    const inputSchema = manifest.input ?? null;
    if (inputSchema === null) return null;

    if (manifest.source === 'entries') {
        return buildEntriesAdapter(manifest, inputSchema);
    }

    switch (manifest.domain) {
        case 'users':
            return buildUsersAdapter(manifest, inputSchema);
        case 'settings':
            return buildSettingsAdapter(manifest, inputSchema);
        case 'media':
            return buildMediaAdapter(manifest, inputSchema);
        default:
            return null;
    }
}
