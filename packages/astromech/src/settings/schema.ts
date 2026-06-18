import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { z } from 'zod';
import { usersTable } from '@/users/schema.js';
import type { JsonValue } from '@/types/index.js';

// ============================================================================
// Settings table
// ============================================================================

export const settingsTable = sqliteTable('settings', {
    key: text('key').primaryKey(),
    value: text('value', { mode: 'json' }).$type<JsonValue>(),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
        .notNull()
        .$defaultFn(() => new Date()),
    updatedBy: text('updated_by').references(() => usersTable.id),
});

export type SettingRow = typeof settingsTable.$inferSelect;
export type NewSettingRow = typeof settingsTable.$inferInsert;

// ============================================================================
// Zod schemas
// ============================================================================

export const setSettingSchema = z.object({
    value: z.unknown(),
});
