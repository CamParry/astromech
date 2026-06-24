/**
 * Plugin hook helpers for entry operations.
 *
 * Hooks fire at the public-method level: `before*` before the DB work (a throw
 * aborts), `after*` after it completes (post-commit, even for bulk). Snapshots
 * for the event context are only loaded when a plugin actually subscribes.
 */

import {
    hasHookHandlers,
    runAfterHooks,
    runBeforeHooks,
} from '@/plugins/runtime/plugin-runtime.js';
import { getCurrentUser } from '@/context/index.js';
import { getEntryStorage } from '../storage/registry.js';
import { loadAndAssertType } from './records.js';
import type { Entry } from '@/types/index.js';

export function entryHooksActive(...events: string[]): boolean {
    return events.some((event) => hasHookHandlers(event));
}

export async function entrySnapshot(type: string, id: string): Promise<Entry> {
    return loadAndAssertType(getEntryStorage(type), type, id);
}

/**
 * Run a trash/delete operation with `entry:beforeDelete`/`entry:afterDelete`
 * hooks. `force` distinguishes permanent delete (true) from trash (false).
 */
export async function runDeleteWithHooks(
    type: string,
    id: string | readonly string[],
    force: boolean,
    op: () => Promise<void>
): Promise<void> {
    if (!entryHooksActive('entry:beforeDelete', 'entry:afterDelete')) {
        await op();
        return;
    }
    const user = getCurrentUser();
    const ids = Array.isArray(id) ? Array.from(id) : [id as string];
    const before = await Promise.all(ids.map((entryId) => entrySnapshot(type, entryId)));
    for (const entry of before) {
        await runBeforeHooks('entry:beforeDelete', { type, entry, user, force }, user);
    }
    await op();
    for (const entry of before) {
        await runAfterHooks('entry:afterDelete', { type, entry, user, force }, user);
    }
}
