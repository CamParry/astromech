/**
 * Stored-content validation report.
 *
 * Validation is write-time only, so tightening a rule never flags rows already
 * stored. `validateStoredContent` walks stored content and reports every row
 * whose field data the CURRENT rules would reject. It writes nothing.
 */

import type { FieldErrors } from '@/types/fields';
import type {
    EntryStatus,
    JsonObject,
    ResolvedGlobal,
    ResourceType,
} from '@/types/index';
import { getDefaultContentLocale } from '@/config/content-locale';
import { getConfig } from '@/config/registry';
import { createRepository } from '@/database/repository/create-repository';
import { existingEntryTypes } from '@/database/repository/resource-existence';
import {
    QUALIFIED_SEPARATOR,
    qualifyEntryType,
    resolveEntryType,
} from '@/entries/entry-types.shared';
import { createEntryLookups } from '@/entries/lookups';
import { getEntryRepository, hasCustomTable } from '@/entries/repository/registry';
import { entriesTable, entryContentTable } from '@/entries/tables';
import { entryValidationMode } from '@/entries/validation-mode.shared';
import { fieldLookupsFromRecords } from '@/fields/field-lookups';
import { flattenEntryFields, flattenFieldNodes } from '@/fields/flatten';
import { safeParseFields } from '@/fields/parse-fields';
import { globalLookups } from '@/globals/internal/stored-fields';
import { globalsService } from '@/globals/service';
import { createMediaLookups } from '@/media/internal/lookups';
import { createMediaRepository } from '@/media/repository';
import { createUserRepository } from '@/users/repository';

/** Scope of a report run. `type` is an ENTRY type; it never covers media, users or globals. */
export type ValidationScope = { type?: string };

export type ValidationFinding = {
    kind: ResourceType;
    /** Entry type; null for media, users and globals. */
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
    const report: ValidationReport = { rowsChecked: 0, findings: [] };

    await checkEntries(report, opts?.type);
    // `type` names an entry type, so a scoped run covers entries only.
    if (opts?.type === undefined) {
        await checkMedia(report);
        await checkUsers(report);
        await checkGlobals(report);
    }

    return report;
}

/**
 * Every live entry row: one per locale of every entry, plus the types backed by
 * their own repository. Trashed entries are skipped — an entry in the trash is
 * on its way out and no write is pending against it. Drafts are reported at the
 * stage their own status implies, so an incomplete draft is not a failure.
 *
 * A content row is reported under its entry's id, which is the id every other
 * surface addresses it by; `locale` is what tells two findings apart.
 */
async function checkEntries(
    report: ValidationReport,
    type: string | undefined
): Promise<void> {
    const where = type !== undefined ? { type } : {};
    const entries = await createRepository(entriesTable).findMany({ where });
    const live = new Map(
        entries
            .filter((entry) => entry.deletedAt == null)
            .map((entry) => [entry.id, entry])
    );
    const contents = await createRepository(entryContentTable).findMany({ where });

    for (const row of contents) {
        const entry = live.get(row.entryId);
        if (entry === undefined) continue;
        await checkEntryRow(report, {
            id: entry.id,
            type: entry.type,
            locale: row.locale,
            status: row.status,
            fields: (row.fields ?? {}) as JsonObject,
            record: row,
        });
    }

    for (const typeName of customTableEntryTypes(type)) {
        const { data } = await getEntryRepository(typeName).list({
            type: typeName,
            limit: 'all',
            locale: 'all',
        });
        for (const record of data) {
            if (record.deletedAt != null) continue;
            await checkEntryRow(report, {
                id: record.id,
                type: typeName,
                // A custom-table repository need not be locale-aware; the fallback
                // matches the entries-table repository's own.
                locale: record.locale ?? getConfig().defaultLocale ?? 'en',
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
    const entryType = resolveEntryType(getConfig(), row.type);
    // A row whose type the config no longer declares has no rules to fail.
    if (!entryType) return;

    report.rowsChecked += 1;
    const definitions = flattenEntryFields(entryType.fields);
    const validate = entryType.validate;
    const processed = await safeParseFields(
        row.fields as Record<string, unknown>,
        definitions,
        {
            operation: 'update',
            validation: entryValidationMode({
                status: row.status,
                hasStatuses: entryType.capabilities.statuses !== false,
            }),
            resource: { kind: 'entry', record: row.record },
            user: null,
            lookups: createEntryLookups(getEntryRepository(row.type), {
                type: row.type,
                locale: row.locale,
                excludeId: row.id,
            }),
            coerceOnly: new Set(),
            collectWarnings: false,
            ...(validate ? { validate } : {}),
        }
    );

    collect(
        report,
        { kind: 'entry', type: row.type, id: row.id, locale: row.locale },
        processed
    );
}

/** Entry types whose rows live outside the `entries` table, plugin types qualified. */
function customTableEntryTypes(type: string | undefined): string[] {
    const config = getConfig();
    const configured = [
        ...Object.keys(config.entries),
        ...Object.entries(config.pluginEntries).flatMap(([plugin, types]) =>
            Object.keys(types).map((name) => qualifyEntryType(plugin, name))
        ),
    ];
    return configured
        .filter(hasCustomTable)
        .filter((candidate) => type === undefined || candidate === type);
}

/**
 * Every content row of every media item, with `media/operations/update.ts`'s
 * context. Rows come straight from the repository rather than through `query`,
 * which resolves a delivery URL and so needs a storage driver the report has no
 * use for; `isUnique` reads only `fields`, which both carry identically. A
 * `unique` rule on media compares within one locale, so each locale is a pass of
 * its own.
 */
async function checkMedia(report: ValidationReport): Promise<void> {
    const config = getConfig();
    const definitions = flattenFieldNodes(config.media?.fields ?? []);
    const validate = config.media?.validate;
    const repository = createMediaRepository();

    // Non-translatable media lives in the default content locale alone.
    const defaultLocale = getDefaultContentLocale();
    const locales = config.media?.translatable
        ? (config.locales ?? [defaultLocale])
        : [defaultLocale];

    for (const locale of locales) {
        // One load per locale: a `unique` rule reads it per row, and the run
        // writes nothing, so the snapshot cannot go stale under it.
        const load = memoize(() => repository.listContent(locale));
        for (const row of await load()) {
            report.rowsChecked += 1;
            const processed = await safeParseFields(row.fields, definitions, {
                operation: 'update',
                resource: { kind: 'media', record: row },
                user: null,
                // Built per row: `excludeId` is what keeps a row from colliding
                // with itself, and only the load behind it is shared.
                lookups: createMediaLookups(
                    { listContent: load },
                    { locale, excludeId: row.id }
                ),
                coerceOnly: new Set(),
                collectWarnings: false,
                ...(validate ? { validate } : {}),
            });
            collect(report, { kind: 'media', type: null, id: row.id, locale }, processed);
        }
    }
}

/** User rows, with `users/operations/update.ts`'s context. */
async function checkUsers(report: ValidationReport): Promise<void> {
    const config = getConfig();
    const definitions = flattenFieldNodes(config.users?.fields ?? []);
    const validate = config.users?.validate;
    const repository = createUserRepository();
    const load = memoize(() => repository.list());
    const rows = await load();

    for (const row of rows) {
        report.rowsChecked += 1;
        const processed = await safeParseFields(
            row.fields as Record<string, unknown>,
            definitions,
            {
                operation: 'update',
                resource: { kind: 'user', record: row },
                user: null,
                lookups: fieldLookupsFromRecords({
                    load,
                    getId: (record) => record.id,
                    getFields: (record) => record.fields as Record<string, unknown>,
                    excludeId: row.id,
                    entryTypes: (ids) => existingEntryTypes(ids),
                }),
                coerceOnly: new Set(),
                collectWarnings: false,
                ...(validate ? { validate } : {}),
            }
        );
        collect(
            report,
            { kind: 'user', type: null, id: row.id, locale: null },
            processed
        );
    }
}

/**
 * Every saved locale of every declared global, host and plugin alike, with
 * `globals/operations/update.ts`'s context. A locale that has never been saved
 * reads back null and is skipped: there is no stored row to report on.
 */
async function checkGlobals(report: ValidationReport): Promise<void> {
    const config = getConfig();
    const declared: [string, ResolvedGlobal][] = [
        ...Object.entries(config.globals),
        ...Object.entries(config.pluginGlobals).flatMap(([plugin, globals]) =>
            Object.entries(globals).map(([key, global]): [string, ResolvedGlobal] => [
                `${plugin}${QUALIFIED_SEPARATOR}${key}`,
                global,
            ])
        ),
    ];

    // A non-translatable global lives in the default content locale alone, and
    // asking it for another is a caller error, not an empty result.
    const defaultLocale = getDefaultContentLocale();
    for (const [key, global] of declared) {
        const locales = global.capabilities.translatable
            ? (config.locales ?? [defaultLocale])
            : [defaultLocale];
        for (const locale of locales) {
            const row = await globalsService.get({ key, locale, full: true });
            if (row === null) continue;

            report.rowsChecked += 1;
            const validate = global.validate;
            const processed = await safeParseFields(
                row.fields as Record<string, unknown>,
                flattenEntryFields(global.fields),
                {
                    operation: 'update',
                    resource: { kind: 'global', record: row },
                    user: null,
                    lookups: globalLookups(),
                    coerceOnly: new Set(),
                    collectWarnings: false,
                    ...(validate ? { validate } : {}),
                }
            );
            collect(report, { kind: 'global', type: null, id: key, locale }, processed);
        }
    }
}

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
