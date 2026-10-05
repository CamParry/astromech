import type { TableSelect } from '@/database/define-table';
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
