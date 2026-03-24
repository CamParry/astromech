/**
 * Drizzle ORM Schema for Astromech CMS
 *
 * Compatible with Cloudflare D1 (SQLite)
 */

import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

// ============================================================================
// Roles
// ============================================================================

export const rolesTable = sqliteTable('roles', {
    slug: text('slug').primaryKey(),
    name: text('name').notNull(),
    permissions: text('permissions', { mode: 'json' }).$type<string[]>().notNull(),
    isBuiltIn: integer('is_built_in', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

// ============================================================================
// usersTable
// ============================================================================

export const usersTable = sqliteTable('users', {
    id: text('id')
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
    email: text('email').notNull().unique(),
    name: text('name').notNull(),
    emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
    image: text('image'),
    fields: text('fields', { mode: 'json' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
        .notNull()
        .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
        .notNull()
        .$defaultFn(() => new Date()),
});

// ============================================================================
// sessionsTable (Better Auth)
// ============================================================================

export const sessionsTable = sqliteTable('sessions', {
    id: text('id').primaryKey(),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
        .notNull()
        .references(() => usersTable.id, { onDelete: 'cascade' }),
});

// ============================================================================
// accountsTable (Better Auth - OAuth providers)
// ============================================================================

export const accountsTable = sqliteTable('accounts', {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
        .notNull()
        .references(() => usersTable.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp' }),
    refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp' }),
    scope: text('scope'),
    password: text('password'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// ============================================================================
// verificationsTable (Better Auth - email verification, password reset)
// ============================================================================

export const verificationsTable = sqliteTable('verifications', {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }),
    updatedAt: integer('updated_at', { mode: 'timestamp' }),
});

// ============================================================================
// Entities
// ============================================================================

export const entitiesTable = sqliteTable(
    'entities',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => crypto.randomUUID()),
        collection: text('collection').notNull(),

        // Translation support (nullable for non-i18n collections)
        locale: text('locale'),

        slug: text('slug'),
        title: text('title').notNull(),
        fields: text('fields', { mode: 'json' }),
        status: text('status', { enum: ['draft', 'published', 'scheduled'] })
            .notNull()
            .default('draft'),
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
        index('idx_entities_collection').on(table.collection),
        index('idx_entities_slug').on(table.collection, table.slug),
        index('idx_entities_status').on(table.collection, table.status),
        index('idx_entities_locale').on(table.collection, table.locale, table.status),
        index('idx_entities_deleted').on(table.deletedAt),
    ]
);

// ============================================================================
// Entity Versions
// ============================================================================

export const entityVersionsTable = sqliteTable(
    'entity_versions',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => crypto.randomUUID()),
        entityId: text('entity_id')
            .notNull()
            .references(() => entitiesTable.id, { onDelete: 'cascade' }),
        versionNumber: integer('version_number').notNull(),
        title: text('title').notNull(),
        fields: text('fields', { mode: 'json' }),
        status: text('status', { enum: ['draft', 'published', 'scheduled'] }),
        createdAt: integer('created_at', { mode: 'timestamp' })
            .notNull()
            .$defaultFn(() => new Date()),
        createdBy: text('created_by').references(() => usersTable.id),
    },
    (table) => [
        index('idx_versions_entity').on(table.entityId, table.versionNumber),
    ]
);

// ============================================================================
// Relationships
// ============================================================================

export const relationshipsTable = sqliteTable(
	'relationships',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		sourceId: text('source_id').notNull(),
		sourceType: text('source_type', {
			enum: ['entity', 'user', 'media'],
		}).notNull(),
		name: text('name').notNull(),
		targetId: text('target_id').notNull(),
		targetType: text('target_type', {
			enum: ['entity', 'user', 'media'],
		}).notNull(),
		position: integer('position').notNull().default(0),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
	},
	(table) => ({
		sourceIdx: index('idx_rel_source').on(table.sourceId, table.sourceType, table.name),
		targetIdx: index('idx_rel_target').on(table.targetId, table.targetType),
	})
);

// ============================================================================
// Media
// ============================================================================

export const mediaTable = sqliteTable(
    'media',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => crypto.randomUUID()),
        filename: text('filename').notNull(),
        mimeType: text('mime_type').notNull(),
        size: integer('size').notNull(),
        url: text('url').notNull(),
        width: integer('width'),
        height: integer('height'),
        alt: text('alt'),
        fields: text('fields', { mode: 'json' }),
        createdAt: integer('created_at', { mode: 'timestamp' })
            .notNull()
            .$defaultFn(() => new Date()),
        updatedAt: integer('updated_at', { mode: 'timestamp' })
            .notNull()
            .$defaultFn(() => new Date()),
        createdBy: text('created_by').references(() => usersTable.id),
    },
    (table) => ({
        mimeTypeIdx: index('idx_media_mime').on(table.mimeType),
        createdAtIdx: index('idx_media_created').on(table.createdAt),
    })
);

// ============================================================================
// Settings
// ============================================================================

export const settingsTable = sqliteTable('settings', {
    key: text('key').primaryKey(),
    value: text('value', { mode: 'json' }).$type<import('@/types/index.js').JsonValue>(),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
        .notNull()
        .$defaultFn(() => new Date()),
    updatedBy: text('updated_by').references(() => usersTable.id),
});

// ============================================================================
// Type Exports
// ============================================================================

export type RoleRow = typeof rolesTable.$inferSelect;
export type NewRoleRow = typeof rolesTable.$inferInsert;

export type UserRow = typeof usersTable.$inferSelect;
export type NewUserRow = typeof usersTable.$inferInsert;

export type SessionRow = typeof sessionsTable.$inferSelect;
export type NewSessionRow = typeof sessionsTable.$inferInsert;

export type AccountRow = typeof accountsTable.$inferSelect;
export type NewAccountRow = typeof accountsTable.$inferInsert;

export type VerificationRow = typeof verificationsTable.$inferSelect;
export type NewVerificationRow = typeof verificationsTable.$inferInsert;

export type EntityRow = typeof entitiesTable.$inferSelect;
export type NewEntityRow = typeof entitiesTable.$inferInsert;

export type EntityVersionRow = typeof entityVersionsTable.$inferSelect;
export type NewEntityVersionRow = typeof entityVersionsTable.$inferInsert;

export type RelationshipRow = typeof relationshipsTable.$inferSelect;
export type NewRelationshipRow = typeof relationshipsTable.$inferInsert;

export type MediaRow = typeof mediaTable.$inferSelect;
export type NewMediaRow = typeof mediaTable.$inferInsert;

export type SettingRow = typeof settingsTable.$inferSelect;
export type NewSettingRow = typeof settingsTable.$inferInsert;
