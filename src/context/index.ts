/**
 * Server-side request context
 *
 * Stores per-request state (current user). The database instance is
 * accessed via getDb() from the registry. Config is accessed via the
 * virtual module import.
 */

import config from 'virtual:astromech/config';
import { getDb } from '@/db/registry.js';
import type { User } from '@/types/index.js';

let currentUser: User | null = null;

export function setCurrentUser(user: User | null): void {
    currentUser = user;
}

export function getCurrentUser(): User | null {
    return currentUser;
}

export function getServerContext() {
    return {
        db: getDb(),
        config,
        user: currentUser,
    };
}
