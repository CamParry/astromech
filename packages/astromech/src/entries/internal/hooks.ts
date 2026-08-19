/**
 * Plugin hook helpers for entry operations.
 *
 * Hooks fire at the public-method level: `before*` before the DB work (a throw
 * aborts), `after*` after it completes (post-commit, even for bulk). Snapshots
 * for the event context are only loaded when a plugin actually subscribes.
 */

import type { Entry, EntryUpdateData } from '@/types/index';
import {
    hasHookHandlers,
    runAfterHooks,
    runBeforeHooks,
} from '@/plugins/runtime/plugin-runtime';
import { getCurrentUser } from '@/request-context/index';
import { getEntryRepository } from '../repository/registry';
import { loadAndAssertType } from './records';

export function hasEntryHooks(...events: string[]): boolean {
    return events.some((event) => hasHookHandlers(event));
}

export async function loadEntrySnapshot(type: string, id: string): Promise<Entry> {
    return loadAndAssertType(getEntryRepository(type), type, id);
}

/**
 * Runs an update with `entry:beforeUpdate`/`entry:afterUpdate` around it.
 * Snapshots are loaded per id only when a plugin actually subscribes.
 */
export async function runUpdateWithHooks<T>(
    type: string,
    ids: readonly string[],
    data: EntryUpdateData,
    op: () => Promise<T>
): Promise<T> {
    if (!hasEntryHooks('entry:beforeUpdate', 'entry:afterUpdate')) return op();

    const user = await getCurrentUser();
    const before = await Promise.all(ids.map((id) => loadEntrySnapshot(type, id)));
    for (const entry of before) {
        await runBeforeHooks('entry:beforeUpdate', { type, entry, data, user }, user);
    }
    const result = await op();
    for (const entry of before) {
        await runAfterHooks('entry:afterUpdate', { type, entry, data, user }, user);
    }
    return result;
}

/**
 * Run a trash/delete operation with `entry:beforeDelete`/`entry:afterDelete`
 * hooks. `permanent` distinguishes permanent delete (true) from trash (false).
 */
export async function runDeleteWithHooks(
    type: string,
    id: string | readonly string[],
    permanent: boolean,
    op: () => Promise<void>
): Promise<void> {
    if (!hasEntryHooks('entry:beforeDelete', 'entry:afterDelete')) {
        await op();
        return;
    }
    const user = await getCurrentUser();
    const ids = Array.isArray(id) ? Array.from(id) : [id as string];
    const before = await Promise.all(
        ids.map((entryId) => loadEntrySnapshot(type, entryId))
    );
    for (const entry of before) {
        await runBeforeHooks(
            'entry:beforeDelete',
            { type, entry, user, permanent },
            user
        );
    }
    await op();
    for (const entry of before) {
        await runAfterHooks('entry:afterDelete', { type, entry, user, permanent }, user);
    }
}
