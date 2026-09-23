/**
 * Stored-content validation report. Validation is write-time only, so tightening
 * a rule never flags rows already stored; this walks stored content and reports
 * every row the CURRENT rules would reject, with each write path's parse context.
 */

import type { ScannedRow } from '@/content/unique';
import type { FieldErrors } from '@/types/fields';
import type {
    AppContext,
    EntryStatus,
    JsonObject,
    ResolvedGlobal,
    ResourceType,
} from '@/types/index';
import { defaultContentLocale } from '@/config/content-locale';
import { RESOURCE_SPECS } from '@/content/resources';
import { definitionsOf, fieldParseContext } from '@/content/write-fields';
import { createRepository } from '@/database/repository/create-repository';
import {
    QUALIFIED_SEPARATOR,
    qualifyEntryType,
    resolveEntryType,
} from '@/entries/entry-types';
import { listEntryRows } from '@/entries/internal/records';
import { getEntryRepository, hasCustomTable } from '@/entries/repository/registry';
import { entriesTable, entryContentTable } from '@/entries/tables';
import { safeParseFields } from '@/fields/parse-fields';
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

/** What a media or user content row carries that the check reads. */
type ContentFieldsRow = { id: string; fields: JsonObject };

/** One stored row to check, with what its write path's parse context needs. */
type StoredRow = {
    kind: ResourceType;
    /** The entry type or global key; users and media have none. */
    target: string | undefined;
    id: string;
    locale: string;
    fields: JsonObject;
    status: EntryStatus | undefined;
    record: unknown;
    scan: () => Promise<readonly ScannedRow[]>;
};

/**
 * Report every stored row the current field rules would reject. Writes nothing.
 * `ctx` is the caller's app context; the CLI hands it the system context.
 */
export async function validateStoredContent(
    ctx: AppContext,
    opts?: ValidationScope
): Promise<ValidationReport> {
    const report: ValidationReport = { rowsChecked: 0, findings: [] };

    await checkEntries(ctx, report, opts?.type);
    // `type` names an entry type, so a scoped run covers entries only.
    if (opts?.type === undefined) {
        await checkContentRows(ctx, report, 'media');
        await checkContentRows(ctx, report, 'user');
        await checkGlobals(ctx, report);
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
    ctx: AppContext,
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
        await checkRow(ctx, report, {
            kind: 'entry',
            target: entry.type,
            id: entry.id,
            locale: row.locale,
            status: row.status,
            fields: (row.fields ?? {}) as JsonObject,
            record: row,
            scan: () =>
                listEntryRows(getEntryRepository(entry.type), entry.type, row.locale),
        });
    }

    for (const typeName of customTableEntryTypes(ctx, type)) {
        const repository = getEntryRepository(typeName);
        const { data } = await repository.list({
            type: typeName,
            limit: 'all',
            locale: 'all',
        });
        for (const record of data) {
            if (record.deletedAt != null) continue;
            // A custom-table repository need not be locale-aware; the fallback
            // matches the entries-table repository's own.
            const locale = record.locale ?? defaultContentLocale(ctx.config);
            await checkRow(ctx, report, {
                kind: 'entry',
                target: typeName,
                id: record.id,
                locale,
                status: record.status,
                fields: record.fields,
                record,
                scan: () => listEntryRows(repository, typeName, locale),
            });
        }
    }
}

/** Entry types whose rows live outside the `entries` table, plugin types qualified. */
function customTableEntryTypes(ctx: AppContext, type: string | undefined): string[] {
    const configured = [
        ...Object.keys(ctx.config.entries),
        ...Object.entries(ctx.config.pluginEntries).flatMap(([plugin, types]) =>
            Object.keys(types).map((name) => qualifyEntryType(plugin, name))
        ),
    ];
    return configured
        .filter(hasCustomTable)
        .filter((candidate) => type === undefined || candidate === type);
}

/**
 * Every content row of every media item or user. Rows come straight from the
 * repository rather than through `query`, which for media resolves a delivery
 * URL the report has no use for. A `unique` rule compares within one locale, so
 * each locale is a pass of its own, with one load shared by its rows.
 */
async function checkContentRows(
    ctx: AppContext,
    report: ValidationReport,
    kind: 'media' | 'user'
): Promise<void> {
    const listContent = (locale: string): Promise<readonly ContentFieldsRow[]> =>
        kind === 'media'
            ? createMediaRepository(ctx.config).listContent(locale)
            : createUserRepository(ctx.config).listContent(locale);
    for (const locale of locales(ctx, RESOURCE_SPECS[kind].translatable(ctx.config))) {
        // One load per locale: the run writes nothing, so it cannot go stale.
        const scan = memoize(() => listContent(locale));
        for (const row of await scan()) {
            await checkRow(ctx, report, {
                kind,
                target: undefined,
                id: row.id,
                locale,
                status: undefined,
                fields: row.fields,
                record: row,
                scan,
            });
        }
    }
}

/**
 * Every saved locale of every declared global, host and plugin alike. A locale
 * that has never been saved reads back null and is skipped: there is no stored
 * row to report on.
 */
async function checkGlobals(ctx: AppContext, report: ValidationReport): Promise<void> {
    const declared: [string, ResolvedGlobal][] = [
        ...Object.entries(ctx.config.globals),
        ...Object.entries(ctx.config.pluginGlobals).flatMap(([plugin, globals]) =>
            Object.entries(globals).map(([key, global]): [string, ResolvedGlobal] => [
                `${plugin}${QUALIFIED_SEPARATOR}${key}`,
                global,
            ])
        ),
    ];

    for (const [key, global] of declared) {
        for (const locale of locales(ctx, global.capabilities.translatable)) {
            const row = await ctx.globals.get({ key, locale, full: true });
            if (row === null) continue;
            await checkRow(ctx, report, {
                kind: 'global',
                target: key,
                id: key,
                locale,
                status: row.status,
                fields: row.fields,
                record: row,
                scan: async () => [],
            });
        }
    }
}

/** A row through its write path's parse, its findings appended to the report. */
async function checkRow(
    ctx: AppContext,
    report: ValidationReport,
    row: StoredRow
): Promise<void> {
    const spec = RESOURCE_SPECS[row.kind];
    // A row whose entry type the config no longer declares has no rules to fail.
    if (row.kind === 'entry' && !resolveEntryType(ctx.config, row.target ?? '')) return;

    report.rowsChecked += 1;
    const processed = await safeParseFields(
        row.fields,
        definitionsOf(spec, ctx.config, row.target),
        {
            ...fieldParseContext(spec, ctx.config, {
                target: row.target,
                operation: 'update',
                record: row.record,
                user: null,
                status: row.status,
                scan: row.scan,
                excludeId: row.id,
                coerceOnly: new Set(),
            }),
            collectWarnings: false,
        }
    );

    const subject = {
        kind: row.kind,
        type: row.kind === 'entry' ? (row.target ?? null) : null,
        id: row.id,
        locale: row.locale,
    };
    collect(report, subject, processed);
}

/**
 * The locales a resource keeps rows in: every configured one when it is
 * translatable, else the default content locale alone.
 */
function locales(ctx: AppContext, translatable: boolean): string[] {
    const defaultLocale = defaultContentLocale(ctx.config);
    return translatable ? (ctx.config.locales ?? [defaultLocale]) : [defaultLocale];
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
function memoize<T>(load: () => Promise<readonly T[]>): () => Promise<readonly T[]> {
    let pending: Promise<readonly T[]> | undefined;
    return () => (pending ??= load());
}
