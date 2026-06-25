/**
 * Throwaway row codec for the 1:1 Drizzle → Kysely port. Reproduces the three
 * runtime conversions Drizzle did silently but `@libsql/client` does not, plus
 * Drizzle's app-side `$defaultFn` columns. Replaced by the descriptor-driven
 * codec in step 2.
 *
 * Storage formats (must match Drizzle's on-disk encoding exactly):
 *   - `ts`   timestamp column → unix **SECONDS** INTEGER. Drizzle's
 *            `{ mode: 'timestamp' }` writes `Math.floor(getTime()/1000)` and
 *            reads `new Date(value * 1000)`. NOT milliseconds.
 *   - `json` → TEXT (JSON string).
 *   - `bool` → INTEGER 0/1 (read back as `Number(value) === 1`).
 *
 * Keys are camelCase to match the active `CamelCasePlugin` (queries take
 * camelCase column refs; result rows come back camelCase).
 *
 * Do NOT use `ParseJSONResultsPlugin` — it would corrupt TEXT columns holding
 * JSON-ish values (e.g. a setting `value` of `"123"`).
 */

type Kind = 'ts' | 'json' | 'bool';
type AppDefault = 'uuid' | 'now';

type TableCodec = {
    kinds: Record<string, Kind>;
    appDefaults: Record<string, AppDefault>;
};

const CODECS: Record<string, TableCodec> = {
    roles: {
        kinds: {
            permissions: 'json',
            isBuiltIn: 'bool',
            createdAt: 'ts',
            updatedAt: 'ts',
        },
        appDefaults: { createdAt: 'now', updatedAt: 'now' },
    },
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
    entries: {
        kinds: {
            fields: 'json',
            publishedAt: 'ts',
            deletedAt: 'ts',
            createdAt: 'ts',
            updatedAt: 'ts',
        },
        appDefaults: {
            id: 'uuid',
            localeGroup: 'uuid',
            createdAt: 'now',
            updatedAt: 'now',
        },
    },
    entryVersions: {
        kinds: { fields: 'json', relations: 'json', createdAt: 'ts' },
        appDefaults: { id: 'uuid', createdAt: 'now' },
    },
    entryPreviewTokens: {
        kinds: { expiresAt: 'ts', createdAt: 'ts' },
        appDefaults: { id: 'uuid', createdAt: 'now' },
    },
    media: {
        kinds: { fields: 'json', metadata: 'json', createdAt: 'ts', updatedAt: 'ts' },
        appDefaults: { id: 'uuid', createdAt: 'now', updatedAt: 'now' },
    },
    settings: {
        kinds: { value: 'json', updatedAt: 'ts' },
        appDefaults: { updatedAt: 'now' },
    },
    notifications: {
        kinds: { createdAt: 'ts' },
        appDefaults: { id: 'uuid', createdAt: 'now' },
    },
    relationships: {
        kinds: { createdAt: 'ts' },
        appDefaults: { id: 'uuid', createdAt: 'now' },
    },
    _astromech_cron: {
        kinds: { enabled: 'bool', lastRun: 'ts', nextRun: 'ts', lock: 'ts' },
        appDefaults: {},
    },
    // Plugin table queried via Kysely (backups). Redirects goes through
    // tableStorage, which carries its own row mapping.
    plugin_backups_runs: {
        kinds: { startedAt: 'ts', finishedAt: 'ts', artifactDeletedAt: 'ts' },
        appDefaults: {},
    },
};

/** Storage → JS. Call on every row a query returns (selects AND `returningAll`). */
export function decode<T extends Record<string, unknown>>(table: string, row: T): T {
    const c = CODECS[table];
    if (!c || !row) return row;
    const out: Record<string, unknown> = { ...row };
    for (const [col, kind] of Object.entries(c.kinds)) {
        const v = out[col];
        if (v === null || v === undefined) continue;
        if (kind === 'ts') out[col] = new Date((v as number) * 1000);
        else if (kind === 'json') out[col] = typeof v === 'string' ? JSON.parse(v) : v;
        else if (kind === 'bool') out[col] = Number(v) === 1;
    }
    return out as T;
}

/** Serialize provided values; drops `undefined` keys (so Kysely omits them). */
function serialize(
    c: TableCodec,
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

/**
 * JS → storage for INSERTs. Injects app-side defaults (id/now) for omitted
 * columns, then serializes. Mirrors Drizzle's `$defaultFn` semantics.
 */
export function encode(
    table: string,
    values: Record<string, unknown>
): Record<string, unknown> {
    const c = CODECS[table];
    if (!c) return stripUndefined(values);
    const out: Record<string, unknown> = { ...values };
    for (const [col, kind] of Object.entries(c.appDefaults)) {
        if (out[col] === undefined)
            out[col] = kind === 'uuid' ? crypto.randomUUID() : new Date();
    }
    return serialize(c, out);
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
    const c = CODECS[table];
    if (!c) return stripUndefined(values);
    return serialize(c, values);
}

function stripUndefined(values: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(values)) {
        if (value !== undefined) out[key] = value;
    }
    return out;
}
