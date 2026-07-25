/**
 * Row codec — bridges domain values (Date, parsed object, boolean) and storage
 * values for the Kysely query layer, reproducing the conversions Drizzle did
 * silently but `@libsql/client` does not.
 *
 * Three tiers:
 *   - **Descriptor-driven (the 10 tables we own):** each table's `defineTable`
 *     descriptor carries per-column `serialize`/`parse`/`default` fns. Our
 *     timestamps are ISO-8601 **TEXT**, ids/localeGroup ULID, json TEXT, bool
 *     INTEGER 0/1. This is the step-2 deliverable replacing the hand-written map.
 *   - **Plugin descriptors (registered at boot):** plugins ship `definePlugin`
 *     descriptors, which `registerPlugins` feeds to `registerDescriptorCodec`.
 *     Same handling as ours — the registry is mutable only because the table set
 *     is not known until config resolves.
 *   - **Legacy (the 4 better-auth tables):** still seconds-INTEGER timestamps /
 *     json TEXT / bool INTEGER, kept verbatim from the step-1 throwaway codec.
 *     better-auth's adapter owns that format; flipping it would break login.
 *
 * Keys are camelCase to match the active `CamelCasePlugin`. Do NOT use
 * `ParseJSONResultsPlugin` — it would corrupt TEXT columns holding JSON-ish
 * values (e.g. a setting `value` of `"123"`).
 */

import type { TableDescriptor } from '@/database/define-table.js';
import { roles } from '@/users/schema.js';
import { entries, entryVersions, entryPreviewTokens } from '@/entries/schema.js';
import { media } from '@/media/schema.js';
import { settings } from '@/settings/schema.js';
import { notifications } from '@/notifications/schema.js';
import { relationships, cron, plugins } from '@/database/schema.js';

// ── Descriptor-driven tables (ours) ─────────────────────────────────────────
// Keyed by the *Kysely* `DB` property name (camelCase, e.g. `entryVersions`),
// NOT `descriptor.name` (the snake_case SQL table name, e.g. `entry_versions`)
// — `decode`/`encode`/`encodePatch` are called with the former throughout
// storage code. `database/schema.ts`'s `CORE_TABLES` is the same 10 as a plain
// array (no key mapping needed there); this map stays hand-listed rather than
// derived from it so the keys are greppable next to the `DB` interface.
const DESCRIPTORS: Record<string, TableDescriptor> = {
    roles,
    entries,
    entryVersions,
    entryPreviewTokens,
    media,
    settings,
    notifications,
    relationships,
    _astromech_cron: cron,
    _astromech_plugins: plugins,
};

// ── Plugin descriptors (registered at boot) ─────────────────────────────────

const PLUGIN_DESCRIPTORS = new Map<string, TableDescriptor>();

/**
 * The property key a SQL table name has on the Kysely `DB` interface under the
 * active `CamelCasePlugin`. The plugin maps `DB` keys → SQL identifiers with a
 * *snake-case* mapper, so the key is whatever snake-cases back to `sqlName`:
 * camelCase for ordinary names, and the name itself for a leading-underscore
 * one (`_astromech_cron` snake-cases to itself). Runtime twin of the
 * `KyselyTableKey` type in `database/define-plugin.ts`.
 */
export function kyselyTableKey(sqlName: string): string {
    if (sqlName.startsWith('_')) return sqlName;
    return sqlName.replace(/_(.)/g, (_, char: string) => char.toUpperCase());
}

/**
 * Register a plugin's `defineTable` descriptor so `decode`/`encode`/
 * `encodePatch` handle its rows like one of ours. Called by `registerPlugins`
 * for every descriptor in every plugin's `schema`.
 *
 * Re-registering the same table is a no-op — boot runs more than once in dev.
 * Registering a *different* descriptor under a key already taken is a
 * programming error (two plugins claiming one table) and throws.
 */
export function registerDescriptorCodec(kyselyKey: string, desc: TableDescriptor): void {
    const existing = PLUGIN_DESCRIPTORS.get(kyselyKey);
    if (existing && !sameDescriptor(existing, desc)) {
        throw new Error(
            `[astromech] Two different table descriptors are registered for "${kyselyKey}" ` +
                `("${existing.name}" and "${desc.name}"). Plugin tables are namespaced by ` +
                `alias — check for a duplicate or mis-aliased plugin.`
        );
    }
    PLUGIN_DESCRIPTORS.set(kyselyKey, desc);
}

/** Identity first (the common case); structural fallback survives a dev reload. */
function sameDescriptor(a: TableDescriptor, b: TableDescriptor): boolean {
    if (a === b) return true;
    if (a.name !== b.name) return false;
    const aKeys = Object.keys(a.columns).sort();
    const bKeys = Object.keys(b.columns).sort();
    return aKeys.length === bKeys.length && aKeys.every((key, i) => key === bKeys[i]);
}

function lookupDescriptor(table: string): TableDescriptor | undefined {
    return DESCRIPTORS[table] ?? PLUGIN_DESCRIPTORS.get(table);
}

// ── Legacy seconds-INTEGER tables (better-auth) ──────────────────────────────
type LegacyKind = 'ts' | 'json' | 'bool';
type AppDefault = 'uuid' | 'now';
type LegacyCodec = {
    kinds: Record<string, LegacyKind>;
    appDefaults: Record<string, AppDefault>;
};

const LEGACY_CODECS: Record<string, LegacyCodec> = {
    users: {
        kinds: {
            emailVerified: 'bool',
            fields: 'json',
            createdAt: 'ts',
            updatedAt: 'ts',
        },
        appDefaults: { id: 'uuid', createdAt: 'now', updatedAt: 'now' },
    },
    sessions: {
        kinds: { expiresAt: 'ts', createdAt: 'ts', updatedAt: 'ts' },
        appDefaults: {},
    },
    accounts: {
        kinds: {
            accessTokenExpiresAt: 'ts',
            refreshTokenExpiresAt: 'ts',
            createdAt: 'ts',
            updatedAt: 'ts',
        },
        appDefaults: {},
    },
    verifications: {
        kinds: { expiresAt: 'ts', createdAt: 'ts', updatedAt: 'ts' },
        appDefaults: {},
    },
};

// ============================================================================
// Public API — signatures identical to the step-1 throwaway codec.
// ============================================================================

/** Storage → JS. Call on every row a query returns (selects AND `returningAll`). */
export function decode<T extends Record<string, unknown>>(table: string, row: T): T {
    if (!row) return row;
    const desc = lookupDescriptor(table);
    if (desc) return decodeWith(desc, row);
    const legacy = LEGACY_CODECS[table];
    if (!legacy) return row;
    const out: Record<string, unknown> = { ...row };
    for (const [col, kind] of Object.entries(legacy.kinds)) {
        const v = out[col];
        if (v === null || v === undefined) continue;
        if (kind === 'ts') out[col] = new Date((v as number) * 1000);
        else if (kind === 'json') out[col] = typeof v === 'string' ? JSON.parse(v) : v;
        else if (kind === 'bool') out[col] = Number(v) === 1;
    }
    return out as T;
}

/**
 * JS → storage for INSERTs. Injects app-side defaults (id/now) for omitted
 * columns, then serializes. Mirrors Drizzle's `$defaultFn` semantics.
 */
export function encode(
    table: string,
    values: Record<string, unknown>
): Record<string, unknown> {
    const desc = lookupDescriptor(table);
    if (desc) return encodeWith(desc, values);
    const legacy = LEGACY_CODECS[table];
    if (!legacy) return stripUndefined(values);
    const out: Record<string, unknown> = { ...values };
    for (const [col, kind] of Object.entries(legacy.appDefaults)) {
        if (out[col] === undefined) {
            out[col] = kind === 'uuid' ? crypto.randomUUID() : new Date();
        }
    }
    return serializeLegacy(legacy, out);
}

/**
 * JS → storage for UPDATEs. Serializes provided columns and drops `undefined`
 * keys (Drizzle `.set()` skips them). Never injects app defaults — `updatedAt`
 * is stamped explicitly by callers, exactly as before.
 */
export function encodePatch(
    table: string,
    values: Record<string, unknown>
): Record<string, unknown> {
    const desc = lookupDescriptor(table);
    if (desc) return encodePatchWith(desc, values);
    const legacy = LEGACY_CODECS[table];
    if (!legacy) return stripUndefined(values);
    return serializeLegacy(legacy, values);
}

// ============================================================================
// Descriptor-keyed API — the same three conversions, addressed by descriptor
// rather than by table-name string. Plugin code holds its own descriptors, so
// it decodes rows without needing to know the `DB` key. Exported via
// `astromech/plugin-kit`.
// ============================================================================

/** Storage → JS for one descriptor's row. */
export function decodeWith<T extends Record<string, unknown>>(
    desc: TableDescriptor,
    row: T
): T {
    if (!row) return row;
    const out: Record<string, unknown> = { ...row };
    for (const [key, col] of Object.entries(desc.columns)) {
        const v = out[key];
        if (v === null || v === undefined) continue;
        out[key] = col.parse(v);
    }
    return out as T;
}

/** JS → storage for an INSERT: inject app defaults (id/now), then serialize. */
export function encodeWith(
    desc: TableDescriptor,
    values: Record<string, unknown>
): Record<string, unknown> {
    const out: Record<string, unknown> = { ...values };
    for (const [key, col] of Object.entries(desc.columns)) {
        if (col.appDefault && out[key] === undefined && col.default) {
            out[key] = col.default();
        }
    }
    return serializeDescriptor(desc, out);
}

/** JS → storage for an UPDATE: serialize what was provided, never default. */
export function encodePatchWith(
    desc: TableDescriptor,
    values: Record<string, unknown>
): Record<string, unknown> {
    return serializeDescriptor(desc, values);
}

// ============================================================================
// Internals
// ============================================================================

function serializeDescriptor(
    desc: TableDescriptor,
    values: Record<string, unknown>
): Record<string, unknown> {
    const out: Record<string, unknown> = { ...values };
    for (const [key, col] of Object.entries(desc.columns)) {
        const v = out[key];
        if (v === null || v === undefined) continue;
        out[key] = col.serialize(v);
    }
    return stripUndefined(out);
}

function serializeLegacy(
    c: LegacyCodec,
    values: Record<string, unknown>
): Record<string, unknown> {
    const out: Record<string, unknown> = { ...values };
    for (const [col, kind] of Object.entries(c.kinds)) {
        const v = out[col];
        if (v === null || v === undefined) continue;
        if (kind === 'ts')
            out[col] = v instanceof Date ? Math.floor(v.getTime() / 1000) : v;
        else if (kind === 'json')
            out[col] = typeof v === 'string' ? v : JSON.stringify(v);
        else if (kind === 'bool') out[col] = v ? 1 : 0;
    }
    return stripUndefined(out);
}

function stripUndefined(values: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(values)) {
        if (value !== undefined) out[key] = value;
    }
    return out;
}
