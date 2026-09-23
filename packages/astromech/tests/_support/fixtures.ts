/**
 * Fixtures shared across the suite: a storage driver that stores nothing, and
 * the roles that route and request-scope tests act under.
 */

import type { Role, StorageDriver, StorageList } from '@/types/index';

/** A storage driver that stores nothing, for tests that never read a file back. */
export const noopStorage: StorageDriver = {
    name: 'test-noop',
    async put(): Promise<void> {
        return undefined;
    },
    async get(): Promise<null> {
        return null;
    },
    async stat(): Promise<null> {
        return null;
    },
    async delete(): Promise<void> {
        return undefined;
    },
    async list(): Promise<StorageList> {
        return { keys: [] };
    },
    getPublicUrl(key: string): string | null {
        return `/${key}`;
    },
};

/** An admin role holding the `*` matcher, so every permission check passes. */
export const adminRole: Role = {
    slug: 'admin',
    name: 'Administrator',
    permissions: ['*'] as Role['permissions'],
    isBuiltIn: true,
};

/** A role holding exactly `permissions`. */
export function roleWith(permissions: string[]): Role {
    return {
        slug: 'test',
        name: 'Test',
        permissions: permissions as Role['permissions'],
        isBuiltIn: false,
    };
}
