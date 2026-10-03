/**
 * The write guard: the conditions a write was decided on. They are checked
 * against the loaded rows before any hook runs, and repeated in the write's own
 * `WHERE`, so a change made in between refuses the write with a 409.
 */

import type { ContentRowId } from './repository/types';
import type { ConflictReason } from '@/errors/resource';
import type { ResourceType } from '@/types/domain';
import { ResourceConflictError, ResourceNotFoundError } from '@/errors/resource';

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
};

/** As much of a loaded row as the guard checks. */
export type GuardedRecord = {
    contentId: ContentRowId;
    deletedAt?: Date | null | undefined;
};

/** The repository half of a guarded write: why a write it refused changed nothing. */
export type GuardedRepository = {
    /**
     * The condition that fails now, `gone` when the content row no longer
     * exists, or null when every condition holds again.
     */
    explainConflict(guard: WriteGuard): Promise<ConflictReason | 'gone' | null>;
};

/** Where a guarded write was aimed, for the error that refuses it. */
type Address = { id: string; locale?: string | undefined };

/**
 * The load-step check: the guard's conditions against the rows just read, so a
 * write refused here fires no hook. Throws `ResourceConflictError`.
 */
export function assertGuardHolds(
    kind: ResourceType,
    loaded: { canonical: GuardedRecord },
    guard: WriteGuard,
    address: Address
): void {
    const trashed = (loaded.canonical.deletedAt ?? null) !== null;
    const reason = trashConflict(guard, trashed);
    if (reason !== null) throw new ResourceConflictError(kind, { ...address, reason });
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
    const reason = explained === null ? guardedReason(guard) : explained;
    if (reason === 'gone') throw new ResourceNotFoundError(kind, address);
    throw new ResourceConflictError(kind, { ...address, reason });
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

/** What each `trash` condition answers when it fails. */
const TRASH_CONFLICTS = {
    live: 'trashed',
    trashed: 'not-trashed',
} as const satisfies Record<NonNullable<WriteGuard['trash']>, ConflictReason>;

/** The reason a guard can fail for; `gone` when it names no condition but the row. */
function guardedReason(guard: WriteGuard): ConflictReason | 'gone' {
    return guard.trash === undefined ? 'gone' : TRASH_CONFLICTS[guard.trash];
}
