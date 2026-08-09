/**
 * An in-memory stand-in for the sessions table: one transcript per user,
 * replaced on every write. The size cap belongs to the real storage and is
 * covered there, so this one always stores.
 */

import { vi } from 'vitest';
import type { SessionsStorage } from '../../src/sessions/storage';
import type { ChatMessage } from '../../src/types';

export type FakeSessions = {
    storage: SessionsStorage;
    rows: Map<string, ChatMessage[]>;
};

/** Storage backed by `rows`, which the caller reads back to assert on writes. */
export function fakeSessions(seed?: Map<string, ChatMessage[]>): FakeSessions {
    const rows = new Map(seed);

    const storage: SessionsStorage = {
        load: vi.fn(async (userId) => rows.get(userId) ?? null),
        save: vi.fn(async (userId, messages) => {
            rows.set(userId, messages);
            return true;
        }),
        clear: vi.fn(async (userId) => {
            rows.delete(userId);
        }),
    };

    return { storage, rows };
}
