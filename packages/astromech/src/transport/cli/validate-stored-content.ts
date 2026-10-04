/**
 * Stored-content validation report. Validation is write-time only, so tightening
 * a rule never flags rows already stored; this walks stored content and reports
 * every row the CURRENT rules would reject, with each write path's parse context.
 */

import type { FieldErrors } from '@/types/fields';
import type { AppContext, EntryStatus, JsonObject, ResourceType } from '@/types/index';
import { defaultContentLocale } from '@/config/content-locale';
import { definitionsOf, fieldParseContext } from '@/content/prepare-fields';
import { isTranslatable } from '@/content/resources';
import { resolveEntryType } from '@/entries/entry-types';
import { entryRepository } from '@/entries/repository/entries-table';
import { safeParseFields } from '@/fields/parse-fields';
import { mediaRepository } from '@/media/repository';
import { userRepository } from '@/users/repository';

/** Scope of a report run. `type` is an ENTRY type; it never covers media, users or globals. */
export type ValidationScope = { type?: string };

export type ValidationFinding = {
    kind: ResourceType;
    /** Entry type; null for media, users and globals. */
    type: string | null;
    id: string;
    locale: string | null;
    /** Whether the row is a staged change rather than the live row. */
    staged: boolean;
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
    staged: boolean;
    fields: JsonObject;
    status: EntryStatus | undefined;
    record: unknown;
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
 * Every content row of every entry not in the trash: one per locale, and one
 * per staged change. Trashed entries are skipped, since no write is pending
 * against them. Drafts are reported at the stage their own status implies, so
 * an incomplete draft is not a failure.
 *
 * A content row is reported under its entry's id, which is the id every other
 * surface addresses it by; `locale` and `staged` tell two findings apart.
 */
async function checkEntries(
    ctx: AppContext,
    report: ValidationReport,
    type: string | undefined
): Promise<void> {
    const entries = await entryRepository.findEntryRowsByType(type);
    const live = new Map(
        entries
            .filter((entry) => entry.deletedAt == null)
            .map((entry) => [entry.id, entry])
    );
    const contents = await entryRepository.findContentRowsByType(type);

    for (const row of contents) {
        const entry = live.get(row.entryId);
        if (entry === undefined) continue;
        await checkRow(ctx, report, {
            kind: 'entry',
            target: entry.type,
            id: entry.id,
            locale: row.locale,
            staged: row.stagedFor != null,
            status: row.status,
            fields: (row.fields ?? {}) as JsonObject,
            record: row,
        });
    }
}

/**
 * Every content row of every media item or user. Rows come straight from the
 * repository rather than through `query`, which for media resolves a delivery
 * URL the report has no use for.
 */
async function checkContentRows(
    ctx: AppContext,
    report: ValidationReport,
    kind: 'media' | 'user'
): Promise<void> {
    const listContent = (locale: string): Promise<readonly ContentFieldsRow[]> =>
        kind === 'media'
            ? mediaRepository.findByLocale(locale)
            : userRepository.findByLocale(locale);
    for (const locale of locales(ctx, isTranslatable(kind, ctx.config))) {
        for (const row of await listContent(locale)) {
            await checkRow(ctx, report, {
                kind,
                target: undefined,
                id: row.id,
                locale,
                staged: false,
                status: undefined,
                fields: row.fields,
                record: row,
            });
        }
    }
}

/**
 * Every saved locale of every declared global, host and plugin alike, and the
 * staged change of each where the global stages. A locale that has never been
 * saved reads back null and is skipped: there is no stored row to report on.
 */
async function checkGlobals(ctx: AppContext, report: ValidationReport): Promise<void> {
    for (const [key, global] of Object.entries(ctx.config.globals)) {
        const stages = global.capabilities.staging ? [false, true] : [false];
        for (const locale of locales(ctx, global.capabilities.translatable)) {
            for (const staged of stages) {
                const row = await ctx.globals.get({ key, locale, full: true, staged });
                if (row === null) continue;
                await checkRow(ctx, report, {
                    kind: 'global',
                    target: key,
                    id: key,
                    locale,
                    staged,
                    status: row.status,
                    fields: row.fields,
                    record: row,
                });
            }
        }
    }
}

/** A row through its write path's parse, its findings appended to the report. */
async function checkRow(
    ctx: AppContext,
    report: ValidationReport,
    row: StoredRow
): Promise<void> {
    // A row whose entry type the config no longer declares has no rules to fail.
    if (row.kind === 'entry' && !resolveEntryType(ctx.config, row.target ?? '')) return;

    report.rowsChecked += 1;
    const processed = await safeParseFields(
        row.fields,
        definitionsOf({ resource: row.kind, config: ctx.config, target: row.target }),
        {
            ...fieldParseContext({
                resource: row.kind,
                config: ctx.config,
                target: row.target,
                operation: 'update',
                existing: row.record,
                user: null,
                status: row.status,
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
        staged: row.staged,
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
