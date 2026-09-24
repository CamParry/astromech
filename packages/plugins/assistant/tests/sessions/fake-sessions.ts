/**
 * An in-memory stand-in for the sessions table: one transcript per user,
 * replaced on every write. The size cap belongs to the real storage and is
 * covered there, so this one always stores.
 */

import type { SessionsRepository } from '../../src/sessions/repository';
import type { ChatMessage } from '../../src/types';
import { vi } from 'vitest';

export type FakeSessions = {
    storage: SessionsRepository;
    rows: Map<string, ChatMessage[]>;
};

/** Storage backed by `rows`, which the caller reads back to assert on writes. */
export function fakeSessions(seed?: Map<string, ChatMessage[]>): FakeSessions {
    const rows = new Map(seed);

    const storage: SessionsRepository = {
        findByUser: vi.fn(async (userId) => rows.get(userId) ?? null),
        upsert: vi.fn(async (userId, messages) => {
            rows.set(userId, messages);
            return true;
        }),
        deleteByUser: vi.fn(async (userId) => {
            rows.delete(userId);
        }),
    };

    return { storage, rows };
}
