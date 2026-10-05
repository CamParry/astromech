import type { TableInsert, TableSelect } from '@/database/define-table';
import { defineTable } from '@/database/define-table';

/**
 * Failed sign-ins per account (`account:<sha256 of the email>`) or address
 * (`address:<rateLimitKey>`). Times are epoch milliseconds.
 */
export const signInFailuresTable = defineTable('sign_in_failures', ({ col }) => ({
    id: col.id({ format: 'uuid' }),
    key: col.text({ notNull: true, unique: true }),
    count: col.integer({ notNull: true }),
    windowStart: col.integer({ notNull: true }),
    lockCount: col.integer({ notNull: true, default: 0 }),
    lockedUntil: col.integer(),
}));

export type SignInFailureRow = TableSelect<typeof signInFailuresTable>;

/** Where a block came from: the sign-in failure counter, or a person. */
export const ADDRESS_BLOCK_SOURCES = ['automatic', 'manual'] as const;

/** Blocked client addresses: an IP address or CIDR range, until `expiresAt` or removed. */
export const blockedAddressesTable = defineTable('blocked_addresses', ({ col }) => ({
    id: col.id(),
    address: col.text({ notNull: true, unique: true }),
    reason: col.text(),
    source: col.enum(ADDRESS_BLOCK_SOURCES, { notNull: true }),
    expiresAt: col.timestamp(),
    createdAt: col.timestamp({ notNull: true, defaultNow: true }),
    createdBy: col.reference('users', { onDelete: 'set null' }),
}));

/** Allowed client addresses, which no block applies to. */
export const allowedAddressesTable = defineTable('allowed_addresses', ({ col }) => ({
    id: col.id(),
    address: col.text({ notNull: true, unique: true }),
    reason: col.text(),
    createdAt: col.timestamp({ notNull: true, defaultNow: true }),
    createdBy: col.reference('users', { onDelete: 'set null' }),
}));

export type BlockedAddressRow = TableSelect<typeof blockedAddressesTable>;
export type NewBlockedAddressRow = TableInsert<typeof blockedAddressesTable>;
export type AllowedAddressRow = TableSelect<typeof allowedAddressesTable>;
export type NewAllowedAddressRow = TableInsert<typeof allowedAddressesTable>;
