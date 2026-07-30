/**
 * MCP Tool Dispatch
 *
 * Builds a ToolDispatch descriptor from a ManifestMethod. Returns null for
 * methods without a v1 adapter (plugin methods, binary-upload methods, and
 * long-tail entries actions).
 */

import type { usersApi } from '@/users/service.js';
import type { mediaApi } from '@/media/service.js';
import type { settingsApi } from '@/settings/service.js';
import type { entries } from '@/entries/service.js';

// ============================================================================
// Types
// ============================================================================

/** Raw JSON Schema object — passed verbatim to the MCP SDK as inputSchema. */
type JsonSchema = Record<string, unknown>;

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
    inputSchema: JsonSchema;
    annotations: ToolAnnotations;
    invoke: (args: Record<string, unknown>) => Promise<unknown>;
};

/** Minimal slice of ManifestMethod consumed here. */
type ManifestMethodSlice = {
    name: string;
    summary?: string | undefined;
    source: 'core' | 'entries' | 'plugin';
    mutates: boolean;
    destructive: boolean;
    idempotent: boolean;
    input?: unknown;
    entryType?: string;
    mount?: string;
    plugin?: string;
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
// Shared JSON Schema fragments
// ============================================================================

const ID_REQUIRED: JsonSchema = {
    type: 'object',
    properties: {
        id: { type: 'string', description: 'Record ID' },
    },
    required: ['id'],
    additionalProperties: false,
};

// ============================================================================
// Core — users adapters
// ============================================================================

function buildUsersAdapter(
    action: string,
    manifest: ManifestMethodSlice
): ToolDispatch | null {
    const base = {
        toolName: `users_${action}`,
        description: manifest.summary ?? `${action} user`,
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
                inputSchema: (manifest.input as JsonSchema | undefined) ?? {
                    type: 'object',
                    properties: {
                        search: { type: 'string' },
                        page: { type: 'number' },
                        limit: { type: 'number' },
                    },
                    additionalProperties: true,
                },
                invoke: async (args) => {
                    const api = await getUsersApi();
                    return api.query(args as Parameters<typeof usersApi.query>[0]);
                },
            };

        case 'get':
            return {
                ...base,
                inputSchema: ID_REQUIRED,
                invoke: async (args) => {
                    const api = await getUsersApi();
                    return api.get({ id: args['id'] as string });
                },
            };

        case 'create':
            return {
                ...base,
                inputSchema: (manifest.input as JsonSchema | undefined) ?? {
                    type: 'object',
                    properties: {
                        email: { type: 'string' },
                        name: { type: 'string' },
                        roleSlug: { type: 'string' },
                    },
                    required: ['email', 'name'],
                    additionalProperties: false,
                },
                invoke: async (args) => {
                    const api = await getUsersApi();
                    return api.create(args as Parameters<typeof usersApi.create>[0]);
                },
            };

        case 'update': {
            return {
                ...base,
                inputSchema: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', description: 'User ID' },
                        name: { type: 'string' },
                        email: { type: 'string' },
                        roleSlug: { type: 'string' },
                    },
                    required: ['id'],
                    additionalProperties: false,
                },
                invoke: async (args) => {
                    const { id, ...rest } = args as { id: string } & Record<
                        string,
                        unknown
                    >;
                    const api = await getUsersApi();
                    return api.update({
                        id,
                        data: rest as Parameters<typeof usersApi.update>[0]['data'],
                    });
                },
            };
        }

        case 'delete':
            return {
                ...base,
                inputSchema: ID_REQUIRED,
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
    action: string,
    manifest: ManifestMethodSlice
): ToolDispatch | null {
    const base = {
        toolName: `settings_${action}`,
        description: manifest.summary ?? `${action} settings`,
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
                inputSchema: {
                    type: 'object',
                    properties: {
                        full: {
                            type: 'boolean',
                            description: 'Include private settings',
                        },
                    },
                    additionalProperties: false,
                },
                invoke: async (args) => {
                    const api = await getSettingsApi();
                    return api.all(args as Parameters<typeof settingsApi.all>[0]);
                },
            };

        case 'get':
            return {
                ...base,
                inputSchema: {
                    type: 'object',
                    properties: {
                        key: { type: 'string', description: 'Setting key' },
                        locale: { type: 'string' },
                        full: { type: 'boolean' },
                    },
                    required: ['key'],
                    additionalProperties: false,
                },
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
                inputSchema: {
                    type: 'object',
                    properties: {
                        key: { type: 'string', description: 'Setting key' },
                        value: { description: 'New value (any JSON-serializable type)' },
                    },
                    required: ['key', 'value'],
                    additionalProperties: false,
                },
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
    action: string,
    manifest: ManifestMethodSlice
): ToolDispatch | null {
    const base = {
        toolName: `media_${action}`,
        description: manifest.summary ?? `${action} media`,
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
                inputSchema: (manifest.input as JsonSchema | undefined) ?? {
                    type: 'object',
                    properties: {
                        search: { type: 'string' },
                        page: { type: 'number' },
                        limit: { type: 'number' },
                    },
                    additionalProperties: true,
                },
                invoke: async (args) => {
                    const api = await getMediaApi();
                    return api.query(args as Parameters<typeof mediaApi.query>[0]);
                },
            };

        case 'get':
            return {
                ...base,
                inputSchema: ID_REQUIRED,
                invoke: async (args) => {
                    const api = await getMediaApi();
                    return api.get({ id: args['id'] as string });
                },
            };

        case 'delete':
            return {
                ...base,
                inputSchema: ID_REQUIRED,
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

const ENTRIES_QUERY_SCHEMA: JsonSchema = {
    type: 'object',
    properties: {
        locale: { type: 'string' },
        full: { type: 'boolean' },
        search: { type: 'string' },
        page: { type: 'number' },
        limit: { type: 'number' },
        status: { type: 'string' },
    },
    additionalProperties: true,
};

const ENTRIES_GET_SCHEMA: JsonSchema = {
    type: 'object',
    properties: {
        id: { type: 'string' },
        locale: { type: 'string' },
        full: { type: 'boolean' },
    },
    required: ['id'],
    additionalProperties: false,
};

const ENTRIES_CREATE_SCHEMA: JsonSchema = {
    type: 'object',
    properties: {
        title: { type: 'string' },
        slug: { type: 'string' },
        locale: { type: 'string' },
        status: { type: 'string' },
        fields: { type: 'object' },
    },
    additionalProperties: false,
};

const ENTRIES_UPDATE_SCHEMA: JsonSchema = {
    type: 'object',
    properties: {
        id: { type: 'string' },
        data: { type: 'object' },
    },
    required: ['id', 'data'],
    additionalProperties: false,
};

const ENTRIES_ID_SCHEMA: JsonSchema = {
    type: 'object',
    properties: {
        id: { type: 'string' },
    },
    required: ['id'],
    additionalProperties: false,
};

function buildEntriesAdapter(
    action: string,
    entryType: string,
    mount: string,
    manifest: ManifestMethodSlice
): ToolDispatch | null {
    // Tool name: entries_<mount>_<type>_<action> when mount !== 'root',
    // otherwise entries_<type>_<action>.
    const toolName =
        mount !== 'root'
            ? `entries_${mount}_${entryType}_${action}`
            : `entries_${entryType}_${action}`;

    const description = manifest.summary ?? `${action} ${entryType} entry`;

    const annotations: ToolAnnotations = {
        title: `${entryType}: ${action}`,
        readOnlyHint: !manifest.mutates,
        destructiveHint: manifest.destructive,
        idempotentHint: manifest.idempotent,
    };

    switch (action) {
        case 'query':
            return {
                toolName,
                description,
                annotations,
                inputSchema: ENTRIES_QUERY_SCHEMA,
                invoke: async (args) => {
                    const svc = await getEntries();
                    return svc.query({ type: entryType, ...args });
                },
            };

        case 'get':
            return {
                toolName,
                description,
                annotations,
                inputSchema: ENTRIES_GET_SCHEMA,
                invoke: async (args) => {
                    const svc = await getEntries();
                    const { id, locale, full } = args as {
                        id: string;
                        locale?: string;
                        full?: boolean;
                    };
                    return svc.get({
                        type: entryType,
                        id,
                        ...(locale !== undefined && { locale }),
                        ...(full !== undefined && { full }),
                    });
                },
            };

        case 'create':
            return {
                toolName,
                description,
                annotations,
                inputSchema: ENTRIES_CREATE_SCHEMA,
                invoke: async (args) => {
                    const svc = await getEntries();
                    return svc.create({ type: entryType, ...args } as Parameters<
                        typeof entries.create
                    >[0]);
                },
            };

        case 'update':
            return {
                toolName,
                description,
                annotations,
                inputSchema: ENTRIES_UPDATE_SCHEMA,
                invoke: async (args) => {
                    const svc = await getEntries();
                    const { id, data } = args as {
                        id: string;
                        data: Record<string, unknown>;
                    };
                    return svc.update({
                        type: entryType,
                        id,
                        data: data as Parameters<typeof entries.update>[0]['data'],
                    });
                },
            };

        case 'publish':
            return {
                toolName,
                description,
                annotations,
                inputSchema: ENTRIES_ID_SCHEMA,
                invoke: async (args) => {
                    const svc = await getEntries();
                    return svc.publish({ type: entryType, id: args['id'] as string });
                },
            };

        case 'unpublish':
            return {
                toolName,
                description,
                annotations,
                inputSchema: ENTRIES_ID_SCHEMA,
                invoke: async (args) => {
                    const svc = await getEntries();
                    return svc.unpublish({ type: entryType, id: args['id'] as string });
                },
            };

        case 'delete':
            return {
                toolName,
                description,
                annotations,
                inputSchema: ENTRIES_ID_SCHEMA,
                invoke: async (args) => {
                    const svc = await getEntries();
                    return svc.delete({ type: entryType, id: args['id'] as string });
                },
            };

        // duplicate/trash/restore/emptyTrash/versions/restoreVersion/schedule → skip v1
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
 */
export function buildDispatch(manifest: ManifestMethodSlice): ToolDispatch | null {
    if (manifest.source === 'plugin') {
        return null;
    }

    if (manifest.source === 'entries') {
        const entryType = manifest.entryType;
        const mount = manifest.mount ?? 'root';
        if (!entryType) return null;

        // action is the part after the dot in manifest.name (e.g. 'entries.query' → 'query')
        const action = manifest.name.split('.').pop() ?? '';
        return buildEntriesAdapter(action, entryType, mount, manifest);
    }

    // source === 'core' — name is domain.action e.g. 'users.create'
    const [domain, action] = manifest.name.split('.');
    if (!domain || !action) return null;

    switch (domain) {
        case 'users':
            return buildUsersAdapter(action, manifest);
        case 'settings':
            return buildSettingsAdapter(action, manifest);
        case 'media':
            return buildMediaAdapter(action, manifest);
        default:
            return null;
    }
}
