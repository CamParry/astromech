/**
 * The draft rules entries and globals share: which writes go to a locale's
 * draft, what a write to the live row requires of the draft, how a draft reads
 * over the live content and folds into it, and the time a draft save stamps
 * (`decisions/published-content-changes-through-a-draft.md`).
 */

import type { WriteGuard } from './write-guard';
import type { EntryStatus, JsonObject, ResourceType } from '@/types/index';
import { ResourceNotFoundError } from '@/errors/resource';

/**
 * Whether a type keeps drafts: it has statuses, so a locale can be published,
 * and does not turn `staging` on. Staging is the older way to hold pending
 * changes; the two never apply to one type, and staging is removed in a later
 * step (`roadmap/in-progress/drafts.md`).
 */
export function keepsDrafts(capabilities: {
    statuses: boolean;
    staging: boolean;
}): boolean {
    return capabilities.statuses && !capabilities.staging;
}

/**
 * Whether a write to a locale with this status goes to the locale's draft: it
 * is published, and the write changes content only. A write naming `status` or
 * `publishedAt` is a publish action, so it writes the live row and folds the
 * draft into it.
 */
function writesDraft(
    status: EntryStatus,
    data: { status?: unknown; publishedAt?: unknown }
): boolean {
    return status === 'published' && contentOnly(data);
}

/** Whether a write names neither `status` nor `publishedAt`, so it changes content only. */
function contentOnly(data: { status?: unknown; publishedAt?: unknown }): boolean {
    return data.status === undefined && data.publishedAt === undefined;
}

/** What every draft row holds beside its key and content columns. */
type DraftAudit = { fields: unknown; updatedAt: Date; updatedBy: string | null };

/** A read a draft can lie over: its fields, its last save and `hasDraft`. */
type DraftedRead = {
    id: string;
    locale: string;
    fields: JsonObject;
    updatedAt: Date;
    updatedBy: string | null;
    hasDraft: boolean;
};

/**
 * What a write to one locale with a row turns out to be:
 * - `draft`: a save of the locale's draft, which replaces `draft` or, when it
 *   is null, makes the first;
 * - `update`: a write to the live row with `data`, which has the draft folded
 *   in when there is one. `draft` is the draft as read, deleted with the
 *   write; undefined when the locale takes no draft, so none is read.
 *
 * `guard` is what the write requires of the draft and of the locale's status,
 * for its `WriteGuard`.
 */
export type DraftEdit<D, P> =
    | { kind: 'draft'; data: P; draft: D | null; guard: DraftGuard }
    | { kind: 'update'; data: P; draft: D | null | undefined; guard: DraftGuard };

/** The part of a `WriteGuard` the draft rule sets. */
type DraftGuard = Pick<WriteGuard, 'published' | 'draft'>;

/**
 * Plans a write to one locale with a row, reading its draft only when the type
 * keeps drafts and the locale is published (`keepsDrafts`, `writesDraft`).
 * Every write that read the draft requires it as read, so two saves from one
 * read conflict and a publish never folds in or deletes a draft saved after
 * it; a draft save also requires the locale to be still published.
 *
 * A locale that read unpublished or scheduled has no draft, and a write to it
 * requires that still: a status change never leaves behind a draft saved
 * meanwhile. A content write there also requires the locale to be still not
 * published, since published meanwhile the change belongs in a draft.
 */
export async function planDraftEdit<
    D extends { updatedAt: Date },
    P extends { status?: unknown; publishedAt?: unknown },
>(params: {
    /** Whether the type keeps drafts and the write is not a staged one. */
    drafts: boolean;
    /** The locale's status as read. */
    status: EntryStatus;
    data: P;
    findDraft: () => Promise<D | null>;
    /** The patch a publish action writes: the draft's content under `data`. */
    fold: (draft: D, data: P) => P;
}): Promise<DraftEdit<D, P>> {
    const { drafts, status, data } = params;
    if (!drafts) return { kind: 'update', data, draft: undefined, guard: {} };
    if (status !== 'published') {
        const guard = contentOnly(data)
            ? { draft: null, published: false }
            : { draft: null };
        return { kind: 'update', data, draft: undefined, guard };
    }
    const draft = await params.findDraft();
    const asRead = { draft: draft?.updatedAt ?? null };
    if (writesDraft(status, data)) {
        return { kind: 'draft', data, draft, guard: { ...asRead, published: true } };
    }
    return {
        kind: 'update',
        data: draft ? params.fold(draft, data) : data,
        draft,
        guard: asRead,
    };
}

/**
 * The fields a publish action writes to a locale with a draft: the draft's,
 * with the caller's patch over them. They merge as an update's do, so a key the
 * patch names replaces the draft's and every other key stays.
 */
export function foldDraftFields(
    draftFields: unknown,
    patch: JsonObject | undefined
): JsonObject {
    const fields = (draftFields ?? {}) as JsonObject;
    return patch === undefined ? fields : { ...fields, ...patch };
}

/**
 * The read as its draft holds it: the draft's fields over the live content,
 * `columns` for the resource's other content columns (an entry's title and
 * slug), and the draft's own `updatedAt` and `updatedBy`, since a draft save
 * never stamps the resource row (`decisions/one-updated-at-per-resource.md`).
 */
export function withDraft<R extends DraftedRead>(
    read: R,
    draft: DraftAudit,
    columns: Partial<R> = {}
): R {
    return {
        ...read,
        ...columns,
        fields: (draft.fields ?? {}) as JsonObject,
        updatedAt: draft.updatedAt,
        updatedBy: draft.updatedBy,
        hasDraft: true,
    };
}

/**
 * The read with its locale's draft over it (`over`, the resource's
 * `withDraft`), or as it is live when it has none.
 */
export async function readDraft<R extends DraftedRead, D>(
    read: R,
    drafts: { findOne(id: string, locale: string): Promise<D | null> },
    over: (read: R, draft: D) => R
): Promise<R> {
    if (!read.hasDraft) return read;
    const draft = await drafts.findOne(read.id, read.locale);
    return draft ? over(read, draft) : read;
}

/**
 * Deletes the locale's draft and answers the read as it is live, which the
 * draft never changed. Throws `ResourceNotFoundError` when the locale has no
 * draft; `address` is the id the call named (a global's key).
 */
export async function discardDraft<R extends DraftedRead>(
    type: ResourceType,
    drafts: { delete(id: string, locale: string): Promise<boolean> },
    read: R,
    address: { id: string }
): Promise<R> {
    const { locale } = read;
    if (!(await drafts.delete(read.id, locale))) {
        throw new ResourceNotFoundError(type, { id: address.id, locale, draft: true });
    }
    return { ...read, hasDraft: false };
}

/**
 * The `updatedAt` a draft save stamps: now, or one millisecond after the draft
 * it replaces when that is later. A save always moves the time, so a second
 * save from the same read, which names the old time in its guard, conflicts.
 */
export function draftSavedAt(replaced: Date | undefined): Date {
    const now = Date.now();
    if (replaced === undefined) return new Date(now);
    return new Date(Math.max(now, replaced.getTime() + 1));
}
