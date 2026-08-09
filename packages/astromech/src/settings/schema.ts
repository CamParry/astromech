import { z } from 'zod';
import type { JsonValue } from '@/types/index';
import { defineTable, type TableSelect, type TableInsert } from '@/database/define-table';

export const settingsTable = defineTable('settings', ({ col }) => ({
    key: col.text({ primaryKey: true }),
    value: col.json<JsonValue>(),
    updatedAt: col.timestamp({ notNull: true, defaultNow: true, onUpdate: true }),
    updatedBy: col.reference('users'),
}));

export type SettingRow = TableSelect<typeof settingsTable>;
export type NewSettingRow = TableInsert<typeof settingsTable>;

// ============================================================================
// Zod schemas
// ============================================================================

export const setSettingSchema = z.object({
    value: z.unknown(),
});
