/**
 * Fixtures shared across the suite: a storage driver that stores nothing, the
 * roles tests act under, and typed builders for values that need no database.
 */

import type { DataField, Role, StorageDriver, StorageList, User } from '@/types/index';

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

/**
 * A `User` with every key filled, for a test that needs a user value but no
 * `users` row. `createTestUser` (`@tests/harness`) inserts one instead.
 */
export function makeUser(overrides: Partial<User> = {}): User {
    const id = overrides.id ?? crypto.randomUUID();
    return {
        id,
        email: `${id}@test.dev`,
        name: 'Test User',
        emailVerified: false,
        image: null,
        locale: 'en',
        locales: ['en'],
        fields: {},
        role: 'admin',
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-01T00:00:00.000Z'),
        ...overrides,
    };
}

/** A field declaration, checked against `DataField` and passed through unchanged. */
export function field(definition: DataField): DataField {
    return definition;
}

/**
 * Hand `value` to code typed as `T` although the type forbids it, for a test of
 * the runtime check behind the type. The one place a test overrides a type.
 */
export function invalid<T>(value: unknown): T {
    return value as T;
}
