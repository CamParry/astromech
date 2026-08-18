/**
 * Row codec — bridges domain values (Date, parsed object, boolean) and storage
 * values for the Kysely query layer, reproducing the conversions Drizzle did
 * silently but `@libsql/client` does not.
 *
 * Two tiers, divided by whether the caller can hold the table's `Table`:
 *
 *   - **Table-keyed** (`decodeWith`/`encodeWith`/`encodePatchWith`) — the
 *     primary path, and the only one used for the 11 tables we own. A
 *     `defineTable` table carries per-column `serialize`/`parse`/`default`
 *     fns, so the caller passes the one it already has and the codec needs
 *     no table registry at all. Each column declares its own storage format,
 *     so `users` (TEXT ids and ISO-8601 TEXT timestamps — better-auth's adapter
 *     writes it too) converts through the same path as any other table.
 *
 *   - **Table-name-keyed** (`decode`/`encode`/`encodePatch`) — for the rows whose
 *     `Table` the caller *cannot* hold. Exactly two cases:
 *       1. `sessions`, `accounts` and `verifications`, which have no descriptor:
 *          nothing of ours writes them, better-auth's adapter owns them outright,
 *          so their conversions are hand-listed in `LEGACY_CODECS`.
 *       2. a plugin table reached by name — resolved through the tables
 *          `registerPlugins` hands to `registerTableCodec` at boot. The
 *          registry is mutable only because the table set is unknown until config
 *          resolves.
 *
 * There was a third tier: a hand-maintained name→`Table` map that let our own
 * tables be addressed by name as well. Every core call site passes its `Table`
 * now, so it is gone — adding a table no longer means remembering to list it
 * here, and this file imports no table at all (which keeps it a plain
 * `database/` leaf rather than a consumer of the schema aggregator).
 *
 * Keys are camelCase to match the active `CamelCasePlugin`. Do NOT use
 * `ParseJSONResultsPlugin` — it would corrupt TEXT columns holding JSON-ish
 * values (e.g. a setting `value` of `"123"`).
 */

import type { Insertable, Updateable } from 'kysely';
import type { KyselyOf, Table, TableSelect } from '@/database/define-table';
import { AstromechError } from '@/errors/index';

// ── Plugin tables (registered at boot) ──────────────────────────────────────

const PLUGIN_TABLES = new Map<string, Table>();

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
 * Register a plugin's `defineTable` table so its rows can also be converted
 * by table name — the table-keyed functions need no registration, this is
 * purely so `decode`/`encode`/`encodePatch` resolve the plugin's tables. Called
 * by `registerPlugins` for every table in every plugin's `schema`.
 *
 * Re-registering the same table is a no-op — boot runs more than once in dev.
 * Registering a *different* table under a key already taken is a
 * programming error (two plugins claiming one table) and throws.
 */
export function registerTableCodec(kyselyKey: string, table: Table): void {
    const existing = PLUGIN_TABLES.get(kyselyKey);
    if (existing && !sameTable(existing, table)) {
        throw new AstromechError(
            `Two different tables are registered for "${kyselyKey}" ` +
                `("${existing.name}" and "${table.name}"). Plugin tables are namespaced by ` +
                `alias — check for a duplicate or mis-aliased plugin.`
        );
    }
    PLUGIN_TABLES.set(kyselyKey, table);
}

/** Identity first (the common case); structural fallback survives a dev reload. */
function sameTable(a: Table, b: Table): boolean {
    if (a === b) return true;
    if (a.name !== b.name) return false;
    const aKeys = Object.keys(a.columns).sort();
    const bKeys = Object.keys(b.columns).sort();
    return aKeys.length === bKeys.length && aKeys.every((key, i) => key === bKeys[i]);
}

// ── Tables with no descriptor (better-auth) ─────────────────────────────────
//
// better-auth's adapter writes ISO-8601 TEXT timestamps, so `ts` parses and
// serializes ISO. A number on the way in is tolerated for rows written when
// these columns were assumed to be unix seconds; nothing writes one now.
type LegacyKind = 'ts' | 'json' | 'bool';
type LegacyCodec = Record<string, LegacyKind>;

const LEGACY_CODECS: Record<string, LegacyCodec> = {
    sessions: { expiresAt: 'ts', createdAt: 'ts', updatedAt: 'ts' },
    accounts: {
        accessTokenExpiresAt: 'ts',
        refreshTokenExpiresAt: 'ts',
        createdAt: 'ts',
        updatedAt: 'ts',
    },
    verifications: { expiresAt: 'ts', createdAt: 'ts', updatedAt: 'ts' },
};

// ============================================================================
// Table-name-keyed API — the better-auth tables with no `Table`, plus any plugin
// table a caller reaches by name. A name that matches neither passes through
// untouched (only `undefined` keys are dropped), because there is nothing to
// convert it by; if that name is one of ours, the caller wants `*With` below.
// Exported from `astromech/database/schema` for seed scripts, which insert into
// `accounts` directly.
// ============================================================================

/** Storage → JS for one row of a better-auth or plugin table, keyed by name. */
export function decode<T extends Record<string, unknown>>(tableName: string, row: T): T {
    if (!row) return row;
    const table = PLUGIN_TABLES.get(tableName);
    // The name-keyed tier has no `Table` type to derive a row shape from, so a
    // plugin table's decoded row is returned in the shape the caller passed in.
    if (table) return decodeWith(table, row) as unknown as T;
    const legacy = LEGACY_CODECS[tableName];
    if (!legacy) return row;
    const out: Record<string, unknown> = { ...row };
    for (const [col, kind] of Object.entries(legacy)) {
        const v = out[col];
        if (v === null || v === undefined) continue;
        if (kind === 'ts') out[col] = parseTimestamp(v);
        else if (kind === 'json') out[col] = typeof v === 'string' ? JSON.parse(v) : v;
        else if (kind === 'bool') out[col] = Number(v) === 1;
    }
    return out as T;
}

/**
 * JS → storage for INSERTs, keyed by name. The tables reached this way have no
 * app-side defaults — better-auth supplies every column it writes — so this is
 * serialization only.
 */
export function encode(
    tableName: string,
    values: Record<string, unknown>
): Record<string, unknown> {
    const table = PLUGIN_TABLES.get(tableName);
    if (table) return encodeWith(table, values);
    const legacy = LEGACY_CODECS[tableName];
    if (!legacy) return stripUndefined(values);
    return serializeLegacy(legacy, values);
}

/**
 * JS → storage for UPDATEs, keyed by name. Serializes provided columns and drops
 * `undefined` keys (Drizzle `.set()` skips them). Never injects app defaults —
 * `updatedAt` is stamped explicitly by callers, exactly as before.
 */
export function encodePatch(
    tableName: string,
    values: Record<string, unknown>
): Record<string, unknown> {
    const table = PLUGIN_TABLES.get(tableName);
    if (table) return encodePatchWith(table, values);
    const legacy = LEGACY_CODECS[tableName];
    if (!legacy) return stripUndefined(values);
    return serializeLegacy(legacy, values);
}

// ============================================================================
// Table-keyed API — the primary path. The caller passes the `Table` it
// already holds, so there is no name→table map to keep in step with the
// `DB` interface, and plugin code converts its own rows without knowing the
// `DB` key at all. Exported from root `astromech`.
// ============================================================================

/**
 * Storage → JS for one table's row. Call on every row a query returns
 * (selects AND `returningAll`). Typed as the table's domain row shape, so the
 * result needs no cast.
 *
 * The overloads keep `decodeWith(t, await q.executeTakeFirst())` honest: a
 * missing row decodes to `undefined`, not to an empty object wearing the row
 * type.
 */
export function decodeWith<D extends Table>(
    table: D,
    row: Record<string, unknown>
): TableSelect<D>;
export function decodeWith<D extends Table>(
    table: D,
    row: Record<string, unknown> | undefined
): TableSelect<D> | undefined;
export function decodeWith<D extends Table>(
    table: D,
    row: Record<string, unknown> | undefined
): TableSelect<D> | undefined {
    if (!row) return undefined;
    const out: Record<string, unknown> = { ...row };
    for (const [key, col] of Object.entries(table.columns)) {
        const v = out[key];
        if (v === null || v === undefined) continue;
        out[key] = col.parse(v);
    }
    return out as TableSelect<D>;
}

/**
 * JS → storage for an INSERT: inject app defaults (id/now), then serialize.
 * Typed as the table's Kysely insert shape so the result goes straight into
 * `.values()` without a cast.
 */
export function encodeWith<D extends Table>(
    table: D,
    values: Record<string, unknown>
): Insertable<KyselyOf<D>> {
    const out: Record<string, unknown> = { ...values };
    for (const [key, col] of Object.entries(table.columns)) {
        if (col.appDefault && out[key] === undefined && col.default) {
            out[key] = col.default();
        }
    }
    return serializeTable(table, out) as Insertable<KyselyOf<D>>;
}

/**
 * JS → storage for an UPDATE: serialize what was provided, never default. Typed
 * as the table's Kysely update shape so the result goes straight into `.set()`.
 */
export function encodePatchWith<D extends Table>(
    table: D,
    values: Record<string, unknown>
): Updateable<KyselyOf<D>> {
    return serializeTable(table, values) as Updateable<KyselyOf<D>>;
}

// ============================================================================
// Internals
// ============================================================================

function serializeTable(
    table: Table,
    values: Record<string, unknown>
): Record<string, unknown> {
    const out: Record<string, unknown> = { ...values };
    for (const [key, col] of Object.entries(table.columns)) {
        const v = out[key];
        if (v === null || v === undefined) continue;
        out[key] = col.serialize(v);
    }
    return stripUndefined(out);
}

function serializeLegacy(
    kinds: LegacyCodec,
    values: Record<string, unknown>
): Record<string, unknown> {
    const out: Record<string, unknown> = { ...values };
    for (const [col, kind] of Object.entries(kinds)) {
        const v = out[col];
        if (v === null || v === undefined) continue;
        if (kind === 'ts') out[col] = v instanceof Date ? v.toISOString() : v;
        else if (kind === 'json')
            out[col] = typeof v === 'string' ? v : JSON.stringify(v);
        else if (kind === 'bool') out[col] = v ? 1 : 0;
    }
    return stripUndefined(out);
}

/** Storage → `Date` for a better-auth timestamp: ISO text, or a unix-seconds
 *  number left by a writer that assumed seconds. */
function parseTimestamp(value: unknown): Date {
    return typeof value === 'number' ? new Date(value * 1000) : new Date(String(value));
}

function stripUndefined(values: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(values)) {
        if (value !== undefined) out[key] = value;
    }
    return out;
}
