/**
 * Stored-content validation report.
 *
 * Validation is write-time only, so tightening a rule never flags rows already
 * stored. `validateStoredContent` walks stored content and reports every row
 * whose field data the CURRENT rules would reject. It writes nothing.
 *
 * Boot owns it because it spans entries, media, users and settings, which no
 * single domain may do — `relationship-index.ts` is the same case. Do NOT
 * import this module from `astro.ts` or `boot.ts`: it pulls in domain services
 * and their `virtual:astromech/config`, which does not resolve during Astro's
 * plain-Node config load.
 *
 * ## Staying inert
 *
 * The pipeline's returned values are DISCARDED. It copies its input, but the
 * copy is shallow and `children()` mints item uuids into what it hands back —
 * dropping the result is what keeps the run read-only. `coerceOnly: new Set()`
 * turns coercion off entirely (defaults, `children()` normalization and
 * validation still run), so a finding never depends on a coercer having
 * rewritten the stored value first. The consequence: a stored value a coercer
 * would repair is reported, so the findings are a SUPERSET of what a write
 * today would reject.
 *
 * Each domain's context otherwise mirrors its own update path. `excludeId`
 * matters most: without it every stored row's `unique` rule collides with itself.
 */

import config from 'virtual:astromech/config';
import { assertPluginSourcesReachable } from './plugin-sources';
import { createStorage } from '@/database/storage/create-storage';
import { existingEntryTypes } from '@/database/storage/resource-existence';
import { entriesTable } from '@/entries/schema';
import { getEntryStorage, hasEntryStorageOverride } from '@/entries/storage/registry';
import { createEntryFieldReads } from '@/entries/reads';
import { qualifyEntryType, resolveEntryType } from '@/entries/type-ids.shared';
import { entryValidationStage } from '@/entries/validation-stage.shared';
import { createMediaStorage } from '@/media/storage';
import { createUserStorage } from '@/users/storage';
import { settingsService } from '@/settings/service';
import { fieldReadsFromRecords } from '@/fields/field-reads';
import { flattenEntryFields, flattenFieldNodes } from '@/fields/flatten';
import { processFields } from '@/fields/pipeline';
import type { EntryStatus, JsonObject, ResourceType } from '@/types/index';
import type { FieldErrors } from '@/types/fields';

/** Scope of a report run. `type` is an ENTRY type; it never covers media, users or settings. */
export type ValidationScope = { type?: string };

export type ValidationFinding = {
    kind: ResourceType;
    /** Entry type; null for media, users and settings. */
    type: string | null;
    id: string;
    locale: string | null;
    /** Null for a form-level message from a resource validator. */
    fieldPath: string | null;
    message: string;
};

export type ValidationReport = {
    rowsChecked: number;
    findings: ValidationFinding[];
};

/** Report every stored row the current field rules would reject. Writes nothing. */
export async function validateStoredContent(
    opts?: ValidationScope
): Promise<ValidationReport> {
    assertPluginSourcesReachable('the report would miss every row they hold');
    const report: ValidationReport = { rowsChecked: 0, findings: [] };

    await checkEntries(report, opts?.type);
    // `type` names an entry type, so a scoped run covers entries only.
    if (opts?.type === undefined) {
        await checkMedia(report);
        await checkUsers(report);
        await checkSettings(report);
    }

    return report;
}

// ============================================================================
// Entries
// ============================================================================

/**
 * Every live entry row, from the `entries` table and from the types backed by
 * their own storage. Trashed rows are skipped — a row in the trash is on its
 * way out and no write is pending against it. Drafts are reported at the stage
 * their own status implies, so an incomplete draft is not a failure.
 */
async function checkEntries(
    report: ValidationReport,
    type: string | undefined
): Promise<void> {
    const rows = await createStorage(entriesTable).findMany({
        where: type !== undefined ? { type } : {},
    });
    for (const row of rows) {
        if (row.deletedAt != null) continue;
        await checkEntryRow(report, {
            id: row.id,
            type: row.type,
            locale: row.locale,
            status: row.status,
            fields: (row.fields ?? {}) as JsonObject,
            record: row,
        });
    }

    for (const typeName of tableBackedEntryTypes(type)) {
        const { data } = await getEntryStorage(typeName).list({
            type: typeName,
            limit: 'all',
            locale: 'all',
        });
        for (const record of data) {
            if (record.deletedAt != null) continue;
            await checkEntryRow(report, {
                id: record.id,
                type: typeName,
                // A table-backed storage need not be locale-aware; the fallback
                // matches the built-in storage's own.
                locale: record.locale ?? config.defaultLocale ?? 'en',
                status: record.status,
                fields: record.fields,
                record,
            });
        }
    }
}

/** One entry row through the pipeline, with `entries/operations/update.ts`'s context. */
async function checkEntryRow(
    report: ValidationReport,
    row: {
        id: string;
        type: string;
        locale: string;
        status: EntryStatus | undefined;
        fields: JsonObject;
        record: unknown;
    }
): Promise<void> {
    const entryType = resolveEntryType(config, row.type);
    // A row whose type the config no longer declares has no rules to fail.
    if (!entryType) return;

    report.rowsChecked += 1;
    const definitions = flattenEntryFields(entryType.fields);
    const resourceValidate = entryType.validate;
    const processed = await processFields(
        row.fields as Record<string, unknown>,
        definitions,
        {
            operation: 'update',
            stage: entryValidationStage({
                status: row.status,
                hasStatuses: entryType.capabilities.statuses !== false,
            }),
            host: { kind: 'entry', record: row.record },
            user: null,
            reads: createEntryFieldReads(getEntryStorage(row.type), {
                type: row.type,
                locale: row.locale,
                excludeId: row.id,
            }),
            coerceOnly: new Set(),
            collectWarnings: false,
            ...(resourceValidate ? { resourceValidate } : {}),
        }
    );

    collect(
        report,
        { kind: 'entry', type: row.type, id: row.id, locale: row.locale },
        processed
    );
}

/** Entry types whose rows live outside the `entries` table, plugin types qualified. */
function tableBackedEntryTypes(type: string | undefined): string[] {
    const configured = [
        ...Object.keys(config.entries),
        ...Object.entries(config.pluginEntries).flatMap(([plugin, types]) =>
            Object.keys(types).map((name) => qualifyEntryType(plugin, name))
        ),
    ];
    return configured
        .filter(hasEntryStorageOverride)
        .filter((candidate) => type === undefined || candidate === type);
}

// ============================================================================
// Media, users and settings
// ============================================================================

/**
 * Media rows, with `media/operations/update.ts`'s context. Rows come straight
 * from storage rather than through `query`, which resolves a delivery URL and
 * so needs a storage driver the report has no use for; `isUnique` reads only
 * `fields`, which both carry identically.
 */
async function checkMedia(report: ValidationReport): Promise<void> {
    const definitions = flattenFieldNodes(config.media?.fields ?? []);
    const resourceValidate = config.media?.validate;
    const storage = createMediaStorage();
    // One load for the whole pass: a `unique` rule reads it per row, and the
    // run writes nothing, so the snapshot cannot go stale under it.
    const load = memoize(() => storage.list());
    const rows = await load();

    for (const row of rows) {
        report.rowsChecked += 1;
        const processed = await processFields(
            (row.fields ?? {}) as Record<string, unknown>,
            definitions,
            {
                operation: 'update',
                host: { kind: 'media', record: row },
                user: null,
                // Built per row: `excludeId` is what keeps a row from colliding
                // with itself, and only the load behind it is shared.
                reads: fieldReadsFromRecords({
                    load,
                    getId: (record) => record.id,
                    getFields: (record) =>
                        (record.fields ?? {}) as Record<string, unknown>,
                    excludeId: row.id,
                    entryTypes: (ids) => existingEntryTypes(ids),
                }),
                coerceOnly: new Set(),
                collectWarnings: false,
                ...(resourceValidate ? { resourceValidate } : {}),
            }
        );
        collect(
            report,
            { kind: 'media', type: null, id: row.id, locale: null },
            processed
        );
    }
}

/** User rows, with `users/operations/update.ts`'s context. */
async function checkUsers(report: ValidationReport): Promise<void> {
    const definitions = flattenFieldNodes(config.users?.fields ?? []);
    const resourceValidate = config.users?.validate;
    const storage = createUserStorage();
    const load = memoize(() => storage.list());
    const rows = await load();

    for (const row of rows) {
        report.rowsChecked += 1;
        const processed = await processFields(
            (row.fields ?? {}) as Record<string, unknown>,
            definitions,
            {
                operation: 'update',
                host: { kind: 'user', record: row },
                user: null,
                reads: fieldReadsFromRecords({
                    load,
                    getId: (record) => record.id,
                    getFields: (record) =>
                        (record.fields ?? {}) as Record<string, unknown>,
                    excludeId: row.id,
                    entryTypes: (ids) => existingEntryTypes(ids),
                }),
                coerceOnly: new Set(),
                collectWarnings: false,
                ...(resourceValidate ? { resourceValidate } : {}),
            }
        );
        collect(
            report,
            { kind: 'user', type: null, id: row.id, locale: null },
            processed
        );
    }
}

/** Settings blobs, with `settings/service.ts`'s context. */
async function checkSettings(report: ValidationReport): Promise<void> {
    const load = memoize(() => settingsService.all({ full: true }));
    const rows = await load();

    for (const row of rows) {
        const value = row.value;
        if (!isPlainObject(value)) continue;
        const baseKey = row.key.includes(':')
            ? row.key.slice(0, row.key.indexOf(':'))
            : row.key;
        const page = config.adminPages.find((candidate) => candidate.baseKey === baseKey);
        if (!page?.fields) continue;

        report.rowsChecked += 1;
        // Only the fields this key's blob holds. A translatable page splits its
        // values across `<key>` and `<key>:<locale>`, so the full definition set
        // would report every field the other row carries as missing.
        const definitions = flattenEntryFields(page.fields).filter((field) =>
            Object.prototype.hasOwnProperty.call(value, field.name)
        );
        // `ResolvedAdminPage` drops `validate`, so it comes from the AUTHORED page.
        const resourceValidate = config.admin?.pages?.find(
            (candidate) => candidate.path === page.path
        )?.validate;
        const processed = await processFields(value, definitions, {
            operation: 'update',
            host: { kind: 'setting', record: null },
            user: null,
            reads: fieldReadsFromRecords({
                // The filter is per row (it keys on this row's `baseKey`); the
                // load behind it is the pass's single snapshot.
                load: async () =>
                    (await load()).filter(
                        (setting) =>
                            setting.key === baseKey ||
                            setting.key.startsWith(`${baseKey}:`)
                    ),
                getId: (setting) => setting.key,
                getFields: (setting) =>
                    isPlainObject(setting.value) ? setting.value : {},
                excludeId: row.key,
                entryTypes: (ids) => existingEntryTypes(ids),
            }),
            coerceOnly: new Set(),
            collectWarnings: false,
            ...(resourceValidate ? { resourceValidate } : {}),
        });
        collect(
            report,
            { kind: 'setting', type: null, id: row.key, locale: null },
            processed
        );
    }
}

// ============================================================================
// Shared
// ============================================================================

/** Append one pipeline result's errors, then its form-level messages. */
function collect(
    report: ValidationReport,
    subject: Omit<ValidationFinding, 'fieldPath' | 'message'>,
    processed: { errors: FieldErrors; form: string[] }
): void {
    for (const [fieldPath, messages] of Object.entries(processed.errors)) {
        for (const message of messages) {
            report.findings.push({ ...subject, fieldPath, message });
        }
    }
    for (const message of processed.form) {
        report.findings.push({ ...subject, fieldPath: null, message });
    }
}

/** Run `load` once and hand every later caller the same promise. */
function memoize<T>(load: () => Promise<T[]>): () => Promise<T[]> {
    let pending: Promise<T[]> | undefined;
    return () => (pending ??= load());
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
