import {
    sqliteTable,
    text,
    integer,
    index,
    uniqueIndex,
    type AnySQLiteColumn,
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { usersTable } from '@/users/schema.js';
import { z } from '@hono/zod-openapi';

// ============================================================================
// Drizzle tables
// ============================================================================

export const entriesTable = sqliteTable(
    'entries',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => crypto.randomUUID()),
        type: text('type').notNull(),
        locale: text('locale').notNull(),
        // Synthetic group identifier shared by all rows that represent the same
        // content across locales. Generated via crypto.randomUUID() on create.
        localeGroup: text('locale_group')
            .notNull()
            .$defaultFn(() => crypto.randomUUID()),

        slug: text('slug'),
        title: text('title').notNull(),
        fields: text('fields', { mode: 'json' }),
        status: text('status', { enum: ['unpublished', 'published', 'scheduled'] })
            .notNull()
            .default('unpublished'),
        // When non-null, this row is a staged change of the referenced canonical
        // entry (forward versioning). Null = a normal, canonical entry. Cascades
        // on canonical hard-delete; staged rows are never soft-deleted.
        stagedFor: text('staged_for').references((): AnySQLiteColumn => entriesTable.id, {
            onDelete: 'cascade',
        }),
        publishedAt: integer('published_at', { mode: 'timestamp' }),
        deletedAt: integer('deleted_at', { mode: 'timestamp' }),

        createdAt: integer('created_at', { mode: 'timestamp' })
            .notNull()
            .$defaultFn(() => new Date()),
        updatedAt: integer('updated_at', { mode: 'timestamp' })
            .notNull()
            .$defaultFn(() => new Date()),
        createdBy: text('created_by').references(() => usersTable.id),
        updatedBy: text('updated_by').references(() => usersTable.id),
    },
    (table) => [
        index('idx_entries_type').on(table.type),
        index('idx_entries_status').on(table.type, table.status),
        index('idx_entries_locale').on(table.type, table.locale, table.status),
        index('idx_entries_deleted').on(table.deletedAt),
        index('idx_entries_locale_group').on(table.localeGroup),
        index('idx_entries_staged_for').on(table.stagedFor),
        uniqueIndex('entries_locale_group_locale_unique').on(
            table.localeGroup,
            table.locale
        ),
        // Partial: staged rows share their canonical's slug, so slug uniqueness
        // applies only to canonical rows (staged_for IS NULL).
        uniqueIndex('entries_type_locale_slug_unique')
            .on(table.type, table.locale, table.slug)
            .where(sql`${table.stagedFor} is null`),
    ]
);

// ============================================================================
// Entry Versions
// ============================================================================

export const entryVersionsTable = sqliteTable(
    'entry_versions',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => crypto.randomUUID()),
        entryId: text('entry_id')
            .notNull()
            .references(() => entriesTable.id, { onDelete: 'cascade' }),
        versionNumber: integer('version_number').notNull(),
        title: text('title').notNull(),
        slug: text('slug'),
        fields: text('fields', { mode: 'json' }),
        relations: text('relations', { mode: 'json' }).$type<
            Record<string, string | string[]>
        >(),
        status: text('status', { enum: ['unpublished', 'published', 'scheduled'] }),
        createdAt: integer('created_at', { mode: 'timestamp' })
            .notNull()
            .$defaultFn(() => new Date()),
        createdBy: text('created_by').references(() => usersTable.id),
    },
    (table) => [index('idx_versions_entry').on(table.entryId, table.versionNumber)]
);

// ============================================================================
// Entry Preview Tokens
// ============================================================================

/**
 * Per-canonical-entry secret that authorizes front-end preview of non-published
 * content (current draft, staged change, or a historical version). One token
 * per canonical entry; only the hash is stored, never the plaintext.
 */
export const entryPreviewTokensTable = sqliteTable('entry_preview_tokens', {
    id: text('id')
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
    entryId: text('entry_id')
        .notNull()
        .references(() => entriesTable.id, { onDelete: 'cascade' }),
    token: text('token').notNull().unique(),
    expiresAt: integer('expires_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
        .notNull()
        .$defaultFn(() => new Date()),
    createdBy: text('created_by').references(() => usersTable.id),
});

export type EntryRow = typeof entriesTable.$inferSelect;
export type NewEntryRow = typeof entriesTable.$inferInsert;

export type EntryVersionRow = typeof entryVersionsTable.$inferSelect;
export type NewEntryVersionRow = typeof entryVersionsTable.$inferInsert;

export type EntryPreviewTokenRow = typeof entryPreviewTokensTable.$inferSelect;
export type NewEntryPreviewTokenRow = typeof entryPreviewTokensTable.$inferInsert;

// ============================================================================
// Zod schemas
// ============================================================================

export const entryStatusEnum = z.enum(['unpublished', 'published', 'scheduled']);

const slugField = z
    .string()
    .regex(
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        'Slug must be lowercase alphanumeric with hyphens'
    )
    .optional();

const publishAtField = z
    .union([
        z.date(),
        z
            .string()
            .datetime({ offset: true })
            .transform((v) => new Date(v)),
    ])
    .nullable()
    .optional();

/**
 * Per-type create schema factory. For titled types (`titleField: 'title'`) the
 * returned schema is byte-identical in behavior to the legacy `createEntrySchema`
 * (same "Title is required" message, same 422s). For titleless types the title
 * is optional — the entries service normalizes a missing title to `''` downstream.
 */
export function createEntrySchemaFor(titleField: 'title' | false) {
    const title =
        titleField === false
            ? z.string().optional().openapi({ example: 'My Post' })
            : z.string().min(1, 'Title is required').openapi({ example: 'My Post' });
    return z
        .object({
            title,
            slug: slugField,
            locale: z.string().min(1).optional().openapi({ example: 'en' }),
            localeGroup: z.string().min(1).optional(),
            fields: z
                .record(z.string(), z.unknown())
                .optional()
                .openapi({ example: { body: 'Hello world' } }),
            status: entryStatusEnum.optional(),
            publishAt: publishAtField,
        })
        .openapi('CreateEntry');
}

/**
 * Per-type update schema factory. For titled types this matches the legacy
 * `updateEntrySchema` ("Title cannot be empty"); titleless types drop the
 * non-empty constraint while keeping title optional.
 */
export function updateEntrySchemaFor(titleField: 'title' | false) {
    const title =
        titleField === false
            ? z.string().optional()
            : z.string().min(1, 'Title cannot be empty').optional();
    return z
        .object({
            title,
            slug: slugField,
            fields: z.record(z.string(), z.unknown()).optional(),
            status: entryStatusEnum.optional(),
            publishAt: publishAtField,
        })
        .openapi('UpdateEntry');
}

/** Titled-type create schema. Kept for OpenAPI registration and bulk paths. */
export const createEntrySchema = createEntrySchemaFor('title');

/** Titled-type update schema. Kept for OpenAPI registration and bulk paths. */
export const updateEntrySchema = updateEntrySchemaFor('title');

export const scheduleEntrySchema = z.object({
    publishAt: z.union([
        z.date(),
        z
            .string()
            .datetime({ offset: true })
            .transform((v) => new Date(v)),
    ]),
});
