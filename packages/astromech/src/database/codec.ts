/**
 * Row codec — bridges domain values (Date, parsed object, boolean) and storage
 * values for the Kysely query layer, reproducing the conversions Drizzle did
 * silently but `@libsql/client` does not.
 *
 * Two tiers:
 *   - **Descriptor-driven (the 9 tables we own):** each table's `defineTable`
 *     descriptor carries per-column `serialize`/`parse`/`default` fns. Our
 *     timestamps are ISO-8601 **TEXT**, ids/localeGroup ULID, json TEXT, bool
 *     INTEGER 0/1. This is the step-2 deliverable replacing the hand-written map.
 *   - **Legacy (4 better-auth tables + `plugin_backups_runs`):** still
 *     seconds-INTEGER timestamps / json TEXT / bool INTEGER, kept verbatim from
 *     the step-1 throwaway codec. better-auth's adapter and the backups plugin
 *     own these formats; flipping them is out of scope (auth) / a later step.
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
import { relationships, cron } from '@/database/schema.js';

// ── Descriptor-driven tables (ours) ─────────────────────────────────────────
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
};

// ── Legacy seconds-INTEGER tables (better-auth + backups plugin) ─────────────
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
    // Plugin table queried via Kysely (backups). Redirects goes through
    // tableStorage, which carries its own row mapping.
    plugin_backups_runs: {
        kinds: { startedAt: 'ts', finishedAt: 'ts', artifactDeletedAt: 'ts' },
        appDefaults: {},
    },
};

// ============================================================================
// Public API — signatures identical to the step-1 throwaway codec.
// ============================================================================

/** Storage → JS. Call on every row a query returns (selects AND `returningAll`). */
export function decode<T extends Record<string, unknown>>(table: string, row: T): T {
    if (!row) return row;
    const desc = DESCRIPTORS[table];
    if (desc) {
        const out: Record<string, unknown> = { ...row };
        for (const [key, col] of Object.entries(desc.columns)) {
            const v = out[key];
            if (v === null || v === undefined) continue;
            out[key] = col.parse(v);
        }
        return out as T;
    }
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
    const desc = DESCRIPTORS[table];
    if (desc) {
        const out: Record<string, unknown> = { ...values };
        for (const [key, col] of Object.entries(desc.columns)) {
            if (col.appDefault && out[key] === undefined && col.default) {
                out[key] = col.default();
            }
        }
        return serializeDescriptor(desc, out);
    }
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
    const desc = DESCRIPTORS[table];
    if (desc) return serializeDescriptor(desc, values);
    const legacy = LEGACY_CODECS[table];
    if (!legacy) return stripUndefined(values);
    return serializeLegacy(legacy, values);
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
