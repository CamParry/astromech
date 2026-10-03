/**
 * The write guard: the conditions a write was decided on. They are checked
 * against the loaded rows before any hook runs, and repeated in the write's own
 * `WHERE`, so a change made in between refuses the write with a 409.
 */

import type { ContentRowId } from './repository/types';
import type { ApiError } from '@/errors/api-error';
import type { ConflictReason } from '@/errors/resource';
import type { ResourceType } from '@/types/domain';
import {
    ResourceConflictError,
    ResourceNotFoundError,
    StagedChangeExistsError,
} from '@/errors/resource';

/**
 * What a guarded write requires of the row it changes. Plain data: the
 * content repository compiles it into the write's `WHERE`.
 */
export type WriteGuard = {
    /** The content row the write was decided from; gone, the write answers 404. */
    contentId: ContentRowId;
    /**
     * Entries only: the entry must be live, or for a restore still in the trash.
     * Read from the entry row's `deletedAt`, not the content row's copy.
     */
    trash?: 'live' | 'trashed' | undefined;
    /**
     * The row must still be scheduled, for this `publishedAt`: the time the
     * scheduled-publish job read. Unscheduled or moved, the write is refused.
     */
    scheduledFor?: Date | undefined;
    /** Staging create: the row must have no staged change yet. */
    stagedAbsent?: true | undefined;
};

/**
 * Why a guarded write was refused: a failed condition, `staged-change-exists`
 * for `stagedAbsent`, or `gone` when the content row no longer exists.
 */
export type GuardFailure = ConflictReason | 'staged-change-exists' | 'gone';

/** As much of a loaded row as the guard checks. */
export type GuardedRecord = {
    contentId: ContentRowId;
    deletedAt?: Date | null | undefined;
    status?: string | undefined;
    publishedAt?: Date | null | undefined;
};

/** The repository half of a guarded write: why a write it refused changed nothing. */
export type GuardedRepository = {
    /** The condition that fails now, or null when every condition holds again. */
    explainConflict(guard: WriteGuard): Promise<GuardFailure | null>;
};

/**
 * Where a guarded write was aimed, for the error that refuses it; `staged` when
 * it wrote a staged change, so a 404 names that.
 */
type Address = { id: string; locale: string; staged?: boolean };

/**
 * The load-step check: the guard's conditions against the rows just read, so a
 * write refused here fires no hook. Throws `ResourceConflictError`.
 */
export function assertGuardHolds(
    kind: ResourceType,
    loaded: { canonical: GuardedRecord; staged?: GuardedRecord | null | undefined },
    guard: WriteGuard,
    address: Address
): void {
    const { canonical } = loaded;
    const trashed = (canonical.deletedAt ?? null) !== null;
    const failure =
        trashConflict(guard, trashed) ??
        scheduleConflict(guard, canonical) ??
        stagedConflict(guard, (loaded.staged ?? null) !== null);
    if (failure !== null) throw refusal(kind, address, failure);
}

/**
 * Runs a guarded write, which answers null when its `WHERE` matched no row.
 * Then asks the repository why, and throws the 409, or the 404 for a row gone.
 */
export async function writeGuarded<R>(params: {
    kind: ResourceType;
    address: Address;
    guard: WriteGuard;
    repository: GuardedRepository;
    write: () => Promise<R | null>;
}): Promise<R> {
    const { kind, address, guard, repository } = params;

    const written = await params.write();
    if (written !== null) return written;

    const explained = await repository.explainConflict(guard);
    // A condition that holds again by the time it is read still refused the
    // write, so the error names the condition the guard sets.
    throw refusal(kind, address, explained ?? guardedFailure(guard));
}

/**
 * Why the guard's `trash` condition refuses a row that is, or is not, in the
 * trash; null when it holds or the guard sets none. The load step and a
 * repository's `explainConflict` both read it.
 */
export function trashConflict(
    guard: WriteGuard,
    trashed: boolean
): ConflictReason | null {
    if (guard.trash === undefined || trashed === (guard.trash === 'trashed')) return null;
    return TRASH_CONFLICTS[guard.trash];
}

/**
 * `not-scheduled` when the guard's `scheduledFor` refuses a row with this status
 * and publish time; null when it holds or the guard sets none.
 */
export function scheduleConflict(
    guard: WriteGuard,
    row: { status?: string | undefined; publishedAt?: Date | null | undefined }
): ConflictReason | null {
    if (guard.scheduledFor === undefined) return null;
    const holds =
        row.status === 'scheduled' &&
        row.publishedAt?.getTime() === guard.scheduledFor.getTime();
    return holds ? null : 'not-scheduled';
}

/**
 * `staged-change-exists` when the guard's `stagedAbsent` refuses a row that has
 * a staged change; null when it holds or the guard sets none.
 */
export function stagedConflict(
    guard: WriteGuard,
    hasStaged: boolean
): 'staged-change-exists' | null {
    return guard.stagedAbsent === true && hasStaged ? 'staged-change-exists' : null;
}

/** The error a failure answers: 404 for a row gone, else a 409. */
function refusal(kind: ResourceType, address: Address, failure: GuardFailure): ApiError {
    const { id, locale } = address;
    if (failure === 'gone') return new ResourceNotFoundError(kind, address);
    if (failure === 'staged-change-exists') {
        return new StagedChangeExistsError(kind, { id, locale });
    }
    return new ResourceConflictError(kind, { id, locale, reason: failure });
}

/** What each `trash` condition answers when it fails. */
const TRASH_CONFLICTS = {
    live: 'trashed',
    trashed: 'not-trashed',
} as const satisfies Record<NonNullable<WriteGuard['trash']>, ConflictReason>;

/** The failure a guard can name; `gone` when it names no condition but the row. */
function guardedFailure(guard: WriteGuard): GuardFailure {
    if (guard.trash !== undefined) return TRASH_CONFLICTS[guard.trash];
    if (guard.scheduledFor !== undefined) return 'not-scheduled';
    return guard.stagedAbsent === true ? 'staged-change-exists' : 'gone';
}
