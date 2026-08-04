import { z } from '@hono/zod-openapi';
import {
    defineTable,
    type TableSelect,
    type TableInsert,
    type Table,
} from '@/database/define-table.js';

// ============================================================================
// Tables (defineTable) — source of truth for types + row codec
//
// Preview tokens: per-canonical-entry secret authorizing front-end preview of
// non-published content (current draft, staged change, or a historical
// version). One token per canonical entry; only the hash is stored.
// ============================================================================

export const entriesTable = defineTable(
    'entries',
    ({ col }) => ({
        id: col.id(),
        type: col.text({ notNull: true }),
        locale: col.text({ notNull: true }),
        // Opaque cross-locale grouping key; app-generated ULID default.
        localeGroup: col.text({ notNull: true, defaultUlid: true }),
        slug: col.text(),
        title: col.text({ notNull: true }),
        fields: col.json(),
        status: col.enum(['unpublished', 'published', 'scheduled'], {
            notNull: true,
            default: 'unpublished',
        }),
        // Self-reference (forward versioning). Annotated thunk breaks the
        // circular inference, mirroring drizzle's AnySQLiteColumn pattern.
        stagedFor: col.reference((): Table => entriesTable, {
            onDelete: 'no action',
        }),
        publishedAt: col.timestamp(),
        deletedAt: col.timestamp(),
        createdAt: col.timestamp({ notNull: true, defaultNow: true }),
        updatedAt: col.timestamp({ notNull: true, defaultNow: true, onUpdate: true }),
        createdBy: col.reference('users'),
        updatedBy: col.reference('users'),
    }),
    ({ index }) => [
        index('idx_entries_type', ['type']),
        index('idx_entries_status', ['type', 'status']),
        index('idx_entries_locale', ['type', 'locale', 'status']),
        index('idx_entries_deleted', ['deletedAt']),
        index('idx_entries_locale_group', ['localeGroup']),
        index('idx_entries_staged_for', ['stagedFor']),
        index('entries_locale_group_locale_unique', ['localeGroup', 'locale'], {
            unique: true,
        }),
        index('entries_type_locale_slug_unique', ['type', 'locale', 'slug'], {
            unique: true,
            where: 'staged_for IS NULL',
        }),
    ]
);

export const entryVersionsTable = defineTable(
    'entry_versions',
    ({ col }) => ({
        id: col.id(),
        entryId: col.reference(() => entriesTable, {
            notNull: true,
            onDelete: 'cascade',
        }),
        versionNumber: col.integer({ notNull: true }),
        title: col.text({ notNull: true }),
        slug: col.text(),
        fields: col.json(),
        status: col.enum(['unpublished', 'published', 'scheduled']),
        createdAt: col.timestamp({ notNull: true, defaultNow: true }),
        createdBy: col.reference('users'),
    }),
    ({ index }) => [index('idx_versions_entry', ['entryId', 'versionNumber'])]
);

export const entryPreviewTokensTable = defineTable('entry_preview_tokens', ({ col }) => ({
    id: col.id(),
    entryId: col.reference(() => entriesTable, { notNull: true, onDelete: 'cascade' }),
    token: col.text({ notNull: true, unique: true }),
    expiresAt: col.timestamp(),
    createdAt: col.timestamp({ notNull: true, defaultNow: true }),
    createdBy: col.reference('users'),
}));

export type EntryRow = TableSelect<typeof entriesTable>;
export type NewEntryRow = TableInsert<typeof entriesTable>;

export type EntryVersionRow = TableSelect<typeof entryVersionsTable>;
export type NewEntryVersionRow = TableInsert<typeof entryVersionsTable>;

export type EntryPreviewTokenRow = TableSelect<typeof entryPreviewTokensTable>;
export type NewEntryPreviewTokenRow = TableInsert<typeof entryPreviewTokensTable>;

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

/**
 * Overrides accepted by `duplicate`. Authored here, in the domain, rather than
 * inline in the route that first needed it: the method descriptor publishes the
 * same payload to MCP and the AI tool-loop, and two copies of a schema is how
 * the transport and the manifest end up describing different things.
 */
export const duplicateOverridesSchema = z
    .object({
        title: z.string().min(1).optional(),
        slug: slugField,
        locale: z.string().min(1).optional(),
        localeGroup: z.string().min(1).optional(),
        fields: z.record(z.string(), z.unknown()).optional(),
        status: entryStatusEnum.optional(),
    })
    .partial();

/**
 * `expiresAt` for a preview token. Coerces an ISO string like every other date
 * the domain accepts, so a JSON caller (MCP, the AI tool-loop) does not write a
 * string into a date column.
 */
export const previewTokenSchema = z.object({ expiresAt: publishAtField });
