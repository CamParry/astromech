# Astromech Architecture

## Overview

Astromech is an Astro integration that provides a complete CMS experience. It injects admin routes, API endpoints, and exposes a type-safe client for accessing content in Astro templates.

```
┌─────────────────────────────────────────────────────────────────┐
│                      User's Astro Project                       │
├─────────────────────────────────────────────────────────────────┤
│  Astro Templates          │  /admin/*           │  /api/cms/*   │
│  (uses internal API)      │  (React SPA)        │  (HTTP API)   │
├───────────────────────────┴─────────────────────┴───────────────┤
│                        Astromech Core                           │
├─────────────────────────────────────────────────────────────────┤
│  Hook System (all features built as hooks)                      │
├─────────────────────────────────────────────────────────────────┤
│  Service Layer (shared business logic)                          │
│  ┌──────────┬──────────┬──────────┬──────────┬──────────┐      │
│  │  Users   │Collections│  Media  │ Settings │  Fields  │      │
│  └──────────┴──────────┴──────────┴──────────┴──────────┘      │
├─────────────────────────────────────────────────────────────────┤
│  Database Adapter          │  Storage Adapter                   │
│  ┌──────────┐              │  ┌──────────┐                      │
│  │ D1/SQLite│              │  │    R2    │                      │
│  └──────────┘              │  └──────────┘                      │
└─────────────────────────────────────────────────────────────────┘
```

## Infrastructure Strategy

**Primary Target: Cloudflare**

- **Runtime:** Cloudflare Workers
- **Database:** D1 (SQLite-compatible)
- **File Storage:** R2 (S3-compatible)

This provides edge deployment, excellent performance, and a cohesive ecosystem. Other adapters can be added later.

**Rendering Mode:** SSR only (for now). No SSG rebuild system until demand warrants it.

---

## Package Structure

```
astromech/
├── src/
│   ├── integration/        # Astro integration entry point
│   ├── core/               # Core service layer
│   │   ├── hooks.ts        # Hook registry and dispatcher
│   │   ├── permissions.ts  # Permission checking utilities
│   │   ├── collections.ts
│   │   ├── entries.ts
│   │   ├── users.ts
│   │   ├── roles.ts
│   │   ├── media.ts
│   │   ├── settings.ts
│   │   └── fields.ts
│   ├── adapters/
│   │   ├── database/
│   │   │   ├── interface.ts
│   │   │   └── d1/         # Cloudflare D1 adapter
│   │   └── storage/
│   │       ├── interface.ts
│   │       └── r2/         # Cloudflare R2 adapter
│   ├── api/                # HTTP API routes (external API)
│   ├── client/             # Type-safe client (internal API)
│   ├── admin/              # React admin SPA
│   ├── auth/               # Better Auth integration
│   ├── locales/            # i18n locale files
│   │   └── en/
│   └── plugins/            # Plugin system
├── package.json
└── tsconfig.json
```

---

## Authentication

Using [Better Auth](https://www.better-auth.com/) with session-based authentication.

**Why Better Auth:**

- Framework-agnostic, works with Astro
- Built-in D1/SQLite support
- Drizzle ORM integration
- Session management with cookie caching
- Extensible via plugins (2FA, passkeys, etc.)

**Integration:**

```typescript
// src/auth/index.ts
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';

export const auth = betterAuth({
    database: drizzleAdapter(db),
    session: {
        cookieCache: {
            enabled: true,
            strategy: 'compact',
        },
    },
});
```

**Routes injected:**

- `/api/cms/auth/[...all]` - Better Auth handler

**Astro middleware** populates `context.locals.user` and `context.locals.session`.

---

## Roles & Permissions

Roles are named groups of permissions. Permissions are granular actions that can be scoped to specific collections.

### Permission Format

```
<resource>:<action>              # e.g., media:upload
<resource>:<action>:<collection> # e.g., entry:update:posts
<resource>:<action>:*            # e.g., entry:read:* (all collections)
```

### Built-in Permissions

```typescript
type Permission =
    // Entry permissions (can be collection-scoped)
    | 'entry:create:*'
    | `entry:create:${string}`
    | 'entry:read:*'
    | `entry:read:${string}`
    | 'entry:update:*'
    | `entry:update:${string}`
    | 'entry:delete:*'
    | `entry:delete:${string}`
    | 'entry:publish:*'
    | `entry:publish:${string}` // Change draft→published

    // Media permissions
    | 'media:upload'
    | 'media:delete'

    // Settings permissions
    | 'settings:read'
    | 'settings:update'

    // User management
    | 'users:read'
    | 'users:create'
    | 'users:update'
    | 'users:delete'

    // Admin access
    | 'admin:access'; // Can access admin UI
```

### Built-in Roles

```typescript
const builtInRoles = {
    admin: {
        name: 'Admin',
        permissions: ['*'], // Wildcard = all permissions
    },
    editor: {
        name: 'Editor',
        permissions: [
            'admin:access',
            'entry:create:*',
            'entry:read:*',
            'entry:update:*',
            'entry:publish:*',
            'media:upload',
            'settings:read',
        ],
    },
    author: {
        name: 'Author',
        permissions: [
            'admin:access',
            'entry:create:*',
            'entry:read:*',
            'entry:update:*', // Can update, but not publish
            'media:upload',
        ],
    },
    viewer: {
        name: 'Viewer',
        permissions: ['admin:access', 'entry:read:*', 'media:read', 'settings:read'],
    },
};
```

### Custom Roles

Custom roles can be defined in config or created via admin UI:

```typescript
astromech({
    // ...
    roles: {
        blog_editor: {
            name: 'Blog Editor',
            permissions: [
                'admin:access',
                'entry:create:posts',
                'entry:read:posts',
                'entry:update:posts',
                'entry:publish:posts',
                'entry:read:categories', // Read-only for categories
                'media:upload',
            ],
        },
    },
});
```

### Permission Checking

```typescript
// In service layer
function canUserPerform(user: User, permission: string): boolean {
    const role = getRoleBySlug(user.roleSlug);
    return (
        role.permissions.includes('*') ||
        role.permissions.includes(permission) ||
        role.permissions.includes(permission.replace(/:[^:]+$/, ':*'))
    );
}

// Usage in hooks
hooks.on('entry:beforeUpdate', async (ctx) => {
    const permission = `entry:update:${ctx.collection.slug}`;
    if (!canUserPerform(ctx.user, permission)) {
        throw new ForbiddenError(`Missing permission: ${permission}`);
    }
});
```

---

## Internationalization (i18n)

### Strategy

- **Core:** Internal localization for admin UI strings (i18next)
- **Multi-language content:** Plugin (not core) for translating entries

### Implementation

Using [i18next](https://www.i18next.com/) for admin UI localization.

```
src/
├── locales/
│   └── en/
│       ├── common.json      # Shared strings
│       ├── admin.json       # Admin UI strings
│       └── errors.json      # Error messages
```

**Locale file structure:**

```json
// locales/en/admin.json
{
    "dashboard": {
        "title": "Dashboard",
        "welcome": "Welcome, {{name}}"
    },
    "collections": {
        "title": "Collections",
        "empty": "No items yet",
        "create": "Create {{collection}}"
    },
    "entry": {
        "status": {
            "draft": "Draft",
            "published": "Published"
        },
        "actions": {
            "save": "Save",
            "publish": "Publish",
            "delete": "Delete"
        }
    }
}
```

**Usage in React admin:**

```typescript
import { useTranslation } from 'react-i18next';

function CollectionList({ collection }: Props) {
  const { t } = useTranslation('admin');

  return (
    <h1>{t('collections.create', { collection: collection.name })}</h1>
  );
}
```

**Initial scope:** English only. Locale structure supports future languages.

---

## Configuration

Users configure Astromech in their `astro.config.mjs`:

```typescript
import { defineConfig } from 'astro/config';
import astromech from 'astromech';
import { d1Adapter } from 'astromech/adapters/d1';
import { r2Adapter } from 'astromech/adapters/r2';
import { seoPlugin } from '@astromech/seo-plugin';
import { redirectsPlugin } from '@astromech/redirects-plugin';

export default defineConfig({
    integrations: [
        astromech({
            database: d1Adapter({ binding: 'DB' }),
            storage: r2Adapter({ binding: 'BUCKET' }),
            adminRoute: '/admin',
            apiRoute: '/api/cms',

            collections: {
                pages: {
                    fieldGroups: [
                        {
                            name: 'content',
                            label: 'Content',
                            location: 'main',
                            priority: 0,
                            fields: [
                                { name: 'body', type: 'richtext' },
                                { name: 'featured_image', type: 'media' },
                            ],
                        },
                    ],
                },
                posts: {
                    versioning: true,
                    fieldGroups: [
                        {
                            name: 'content',
                            label: 'Content',
                            location: 'main',
                            priority: 0,
                            fields: [
                                { name: 'body', type: 'richtext' },
                                { name: 'excerpt', type: 'textarea' },
                            ],
                        },
                        {
                            name: 'taxonomy',
                            label: 'Taxonomy',
                            location: 'sidebar',
                            priority: 10,
                            fields: [
                                {
                                    name: 'category',
                                    type: 'relation',
                                    target: 'categories',
                                    inverse: 'posts',
                                },
                                {
                                    name: 'tags',
                                    type: 'relation',
                                    target: 'tags',
                                    multiple: true,
                                    inverse: 'posts',
                                },
                            ],
                        },
                    ],
                },
                categories: {
                    fieldGroups: [
                        {
                            name: 'content',
                            label: 'Content',
                            location: 'main',
                            priority: 0,
                            fields: [{ name: 'description', type: 'textarea' }],
                        },
                    ],
                },
            },

            // Plugins with declarative targeting
            plugins: [
                seoPlugin({
                    targets: ['pages', 'posts'],
                    sitemap: true,
                }),
                redirectsPlugin({
                    generateOnSlugChange: true,
                }),
            ],
        }),
    ],
});
```

---

## Entry Model

All entries share a common base structure:

```typescript
interface Entry {
    id: string; // UUID
    collectionId: string; // Reference to collection
    slug: string | null; // URL-friendly identifier (auto-generated or manual)
    title: string;
    fields: JsonObject; // Collection-specific fields as JSON
    status: 'draft' | 'published' | 'scheduled';
    publishAt: Date | null; // Scheduled publish date (null = immediate)
    deletedAt: Date | null; // Soft delete timestamp (null = not deleted)
    createdAt: Date;
    updatedAt: Date;
    createdBy: string; // User ID
    updatedBy: string; // User ID
}
```

---

## Core Field Types

Fields define the structure of collection data. Each field has a type that determines validation, storage, and admin UI rendering.

### Built-in Field Types

| Type          | Description                      | Stored As           |
| ------------- | -------------------------------- | ------------------- |
| `text`        | Single-line text input           | `string`            |
| `textarea`    | Multi-line text input            | `string`            |
| `richtext`    | WYSIWYG editor (HTML or JSON)    | `string`            |
| `number`      | Numeric input (int or float)     | `number`            |
| `boolean`     | Toggle/checkbox                  | `boolean`           |
| `date`        | Date picker                      | `string` (ISO 8601) |
| `datetime`    | Date and time picker             | `string` (ISO 8601) |
| `select`      | Dropdown with predefined options | `string`            |
| `multiselect` | Multiple selection               | `string[]`          |
| `media`       | Reference to media item          | `string` (media ID) |
| `relation`    | Reference to another entry       | `string` (entry ID) |
| `json`        | Raw JSON data                    | `object`            |
| `group`       | Nested group of fields           | `object`            |
| `repeater`    | Repeatable group of fields       | `array`             |

### Field Definition

```typescript
type FieldDefinition = {
    name: string; // Unique field identifier
    type: FieldType;
    label?: string; // Display label (defaults to name)
    required?: boolean; // Default: false
    defaultValue?: unknown;
    validation?: ValidationRule[];

    // Type-specific options
    options?: SelectOption[]; // For select/multiselect
    target?: string; // For relation (collection slug)
    multiple?: boolean; // For relation (one-to-many)
    fields?: FieldDefinition[]; // For group/repeater
    min?: number; // For number/repeater
    max?: number; // For number/repeater

    // Translation support (requires translations plugin)
    translatable?: boolean; // Default: true (set false for shared fields like relations)
};
```

### Example Field Definitions

Fields are defined within field groups. Here's an example showing various field types:

```typescript
fieldGroups: [
    {
        name: 'content',
        label: 'Content',
        location: 'main',
        priority: 0,
        fields: [
            { name: 'body', type: 'richtext', required: true },
            { name: 'excerpt', type: 'textarea', validation: [{ maxLength: 300 }] },
            { name: 'featured_image', type: 'media' },
            { name: 'published_date', type: 'datetime' },
            { name: 'is_featured', type: 'boolean', defaultValue: false },
            {
                name: 'author_info',
                type: 'group',
                fields: [
                    { name: 'bio_override', type: 'textarea' },
                    { name: 'show_author', type: 'boolean', defaultValue: true },
                ],
            },
        ],
    },
    {
        name: 'taxonomy',
        label: 'Taxonomy',
        location: 'sidebar',
        priority: 10,
        fields: [
            {
                name: 'category',
                type: 'relation',
                target: 'categories',
                inverse: 'posts',
            },
            {
                name: 'tags',
                type: 'relation',
                target: 'tags',
                multiple: true,
                inverse: 'posts',
            },
            { name: 'author', type: 'relation', target: 'users', inverse: 'posts' },
        ],
    },
];
```

---

## Field Groups

Field groups organize fields into logical UI sections with control over positioning and display.

### Field Group Definition

```typescript
interface FieldGroup {
    name: string; // Unique identifier (e.g., 'seo', 'content')
    label: string; // Display label in admin UI

    // UI positioning
    location: 'main' | 'sidebar'; // Which zone in admin UI
    priority?: number; // Lower = renders first (default: 10)

    // Optional UI settings
    collapsed?: boolean; // Start collapsed in UI (default: false)
    description?: string; // Help text shown below group label

    // The fields in this group
    fields: FieldDefinition[];
}
```

### Configuration

Field groups are defined inline within each collection, media, or users config. All fields must be in explicit field groups.

```typescript
astromech({
    collections: {
        posts: {
            versioning: true,
            fieldGroups: [
                {
                    name: 'content',
                    label: 'Content',
                    location: 'main',
                    priority: 0,
                    fields: [
                        { name: 'body', type: 'richtext', required: true },
                        { name: 'excerpt', type: 'textarea' },
                    ],
                },
                {
                    name: 'taxonomy',
                    label: 'Taxonomy',
                    location: 'sidebar',
                    priority: 10,
                    fields: [
                        {
                            name: 'category',
                            type: 'relation',
                            target: 'categories',
                            inverse: 'posts',
                        },
                        {
                            name: 'tags',
                            type: 'relation',
                            target: 'tags',
                            multiple: true,
                            inverse: 'posts',
                        },
                        {
                            name: 'author',
                            type: 'relation',
                            target: 'users',
                            inverse: 'posts',
                        },
                    ],
                },
            ],
        },
        pages: {
            fieldGroups: [
                {
                    name: 'content',
                    label: 'Content',
                    location: 'main',
                    priority: 0,
                    fields: [{ name: 'body', type: 'richtext' }],
                },
            ],
        },
    },

    // Custom fields for media items
    media: {
        fieldGroups: [
            {
                name: 'metadata',
                label: 'Metadata',
                location: 'main',
                priority: 0,
                fields: [
                    { name: 'photographer', type: 'text' },
                    { name: 'copyright', type: 'text' },
                    { name: 'alt_text', type: 'text' },
                ],
            },
        ],
    },

    // Custom profile fields for users
    users: {
        fieldGroups: [
            {
                name: 'profile',
                label: 'Profile',
                location: 'main',
                priority: 0,
                fields: [
                    { name: 'bio', type: 'textarea' },
                    { name: 'avatar', type: 'relation', target: 'media' },
                ],
            },
        ],
        // No relations key needed - inverse defined on the field that creates the relation
    },
});
```

### Built-in Groups

The system provides one built-in group that cannot be removed:

- **Status** (sidebar, priority: 0) - Title, slug, status, scheduled publish date

### Admin UI Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  Edit Post: "My Blog Post"                              [Save] [▾]  │
├─────────────────────────────────────────┬───────────────────────────┤
│                                         │                           │
│  ┌─ Content (main, priority: 0) ──────┐ │ ┌─ Status ──────────────┐ │
│  │                                    │ │ │ Draft / Published     │ │
│  │  Title: [                       ]  │ │ │ Scheduled: [date]     │ │
│  │                                    │ │ └───────────────────────┘ │
│  │  Content:                          │ │                           │
│  │  ┌────────────────────────────┐    │ │ ┌─ SEO (sidebar, p:10) ─┐ │
│  │  │ Rich text editor           │    │ │ │ ▼ (collapsed)         │ │
│  │  │                            │    │ │ └───────────────────────┘ │
│  │  └────────────────────────────┘    │ │                           │
│  └────────────────────────────────────┘ │ ┌─ Featured (sidebar) ──┐ │
│                                         │ │ □ Feature this item   │ │
│                                         │ │ Order: [0]            │ │
│                                         │ └───────────────────────┘ │
└─────────────────────────────────────────┴───────────────────────────┘
```

### Storage

Field groups are a **configuration/UI concept only**. Fields from all groups are stored flat in the entry's `fields` JSON column:

```json
{
    "body": "<p>Blog post content...</p>",
    "meta_title": "My SEO Title",
    "meta_description": "Description for search engines",
    "is_featured": true,
    "featured_order": 5
}
```

---

## Field Validation

Validation rules are applied before saving an entry. Failed validation returns structured errors.

### Built-in Validators

```typescript
type ValidationRule =
    | { required: true }
    | { minLength: number }
    | { maxLength: number }
    | { min: number } // For numbers
    | { max: number } // For numbers
    | { pattern: string; message?: string } // Regex
    | { email: true }
    | { url: true }
    | { custom: (value: unknown, entry: Entry) => string | null }; // Return error message or null
```

### Validation in Config

```typescript
fields: [
    {
        name: 'email',
        type: 'text',
        required: true,
        validation: [{ email: true }],
    },
    {
        name: 'age',
        type: 'number',
        validation: [{ min: 0 }, { max: 150 }],
    },
    {
        name: 'slug',
        type: 'text',
        validation: [
            { pattern: '^[a-z0-9-]+$', message: 'Slug must be lowercase with hyphens' },
        ],
    },
];
```

### Validation Response

```typescript
// On validation failure
{
  error: 'VALIDATION_ERROR',
  message: 'Validation failed',
  fields: {
    email: ['Invalid email format'],
    age: ['Must be at least 0'],
  },
}
```

---

## Relations

Relations link entries across collections. Relations are stored in a dedicated table for efficient querying with proper indexes.

### Relation Types

| Type             | Config                      | Description                       |
| ---------------- | --------------------------- | --------------------------------- |
| **One-to-one**   | `multiple: false` (default) | Single reference (post → author)  |
| **One-to-many**  | `multiple: true`            | Multiple references (post → tags) |
| **Many-to-many** | `multiple: true` + inverse  | Bidirectional (posts ↔ tags)      |

### Configuration

Relations are defined on fields with an optional `inverse` property for bidirectional access:

```typescript
collections: {
  posts: {
    fieldGroups: [{
      name: 'content',
      fields: [
        // One-to-one with inverse: users.posts returns all posts by this user
        { name: 'author', type: 'relation', target: 'users', inverse: 'posts' },

        // One-to-one: category.posts returns all posts in this category
        { name: 'category', type: 'relation', target: 'categories', inverse: 'posts' },

        // One-to-many with inverse: tag.posts returns all posts with this tag
        { name: 'tags', type: 'relation', target: 'tags', multiple: true, inverse: 'posts' },
      ],
    }],
  },
}
```

### Target Types

Reserved names `users` and `media` refer to system resources. All other names are collection slugs.

```typescript
// Entry → Entry (collection name)
{ name: 'category', type: 'relation', target: 'categories', inverse: 'posts' }

// Entry → User (reserved name)
{ name: 'author', type: 'relation', target: 'users', inverse: 'posts' }
{ name: 'reviewers', type: 'relation', target: 'users', multiple: true }

// Entry → Media (reserved name)
{ name: 'featured_image', type: 'relation', target: 'media' }
{ name: 'attachments', type: 'relation', target: 'media', multiple: true }
```

### Inverse Relations

The `inverse` property creates a computed property on the target resource:

```typescript
// posts.author → users creates users.posts
{ name: 'author', type: 'relation', target: 'users', inverse: 'posts' }

// Usage:
const user = await Astromech.users.get(userId);
const userPosts = await user.posts();  // Computed from relationships table
```

- **Optional**: If omitted, no inverse is created
- **Naming**: The inverse name should describe what the target "has" (user has posts)
- **Not stored**: Inverses are computed from the relationships table, not stored

### Relationships Table

Relations are stored in a dedicated polymorphic `relationships` table instead of JSON fields for:

- **Indexing:** Efficient lookups in both directions
- **Polymorphic:** Supports entry↔entry, entry↔user, user↔entry relations
- **Ordering:** Support for ordered relations (e.g., featured posts order)
- **Translations:** Links localized entry rows via `_translations` reserved name

```typescript
// Resource types that can participate in relations
type ResourceType = 'entry' | 'user' | 'media';

export const relationships = sqliteTable('relationships', {
    id: text('id').primaryKey(), // UUID

    // Source (the resource that "has" the relation)
    sourceId: text('source_id').notNull(), // UUID
    sourceType: text('source_type', { enum: ['entry', 'user', 'media'] }).notNull(),
    name: text('name').notNull(), // e.g., 'author', 'category', '_translations'

    // Target (the resource being referenced)
    targetId: text('target_id').notNull(), // UUID
    targetType: text('target_type', { enum: ['entry', 'user', 'media'] }).notNull(),

    position: integer('position').default(0), // For ordered relations
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// Composite indexes for efficient querying:
// idx_rel_source: (source_id, source_type, name)
// idx_rel_target: (target_id, target_type)
```

**Reserved relationship names:**

- `_translations` - Links default locale entry to its translations

### Relation Examples

**Entry → User (with inverse):**

```typescript
// posts collection config
{ name: 'author', type: 'relation', target: 'users', inverse: 'posts' }

// Creates relationship row:
// source: entry/posts/post-123, field: author
// target: user/user-456

// The inverse 'posts' is now available on users:
const user = await Astromech.users.get(userId);
const userPosts = await user.posts();  // Computed from relationships table
```

**Entry → Entry (with inverse):**

```typescript
// posts collection config
{ name: 'category', type: 'relation', target: 'categories', inverse: 'posts' }
{ name: 'related_posts', type: 'relation', target: 'posts', multiple: true }

// categories.posts is now available:
const category = await Astromech.collections.categories.get(categoryId);
const categoryPosts = await category.posts();
```

### How Relations Work

**Creating a relation:**

```typescript
await Astromech.collections.posts.update(postId, {
    fields: {
        category: categoryId, // One-to-one: single ID
        tags: [tag1Id, tag2Id, tag3Id], // One-to-many: array of IDs
    },
});
// Internally: inserts/updates rows in entry_relationships table
```

**Querying with populate:**

```typescript
const post = await Astromech.collections.posts.get(id, {
    populate: ['category', 'tags', 'author'],
});

// post.fields.category → full Category entry
// post.fields.tags → array of full Tag entries
// post.fields.author → full Author entry
```

**Inverse queries (efficient via index):**

```typescript
const author = await Astromech.collections.authors.get(authorId, {
    populate: ['posts'],
});
// author.fields.posts → array of Post entries (uses idx_rel_target)
```

**Filtering by relation:**

```typescript
// Find posts in a specific category
const posts = await Astromech.collections.posts.where({
    'category.id': categoryId,
});

// Find posts tagged with a specific tag
const posts = await Astromech.collections.posts.where({
    'tags.id': { contains: tagId },
});
```

### Ordered Relations

For relations where order matters:

```typescript
// Field config
{ name: 'featured_posts', type: 'relation', target: 'posts', multiple: true, ordered: true, inverse: 'featured_on' }

// Reorder via API
await Astromech.collections.homepage.reorderRelation(homepageId, 'featured_posts', [
  post3Id,  // position: 0
  post1Id,  // position: 1
  post2Id,  // position: 2
]);
```

### Cascade Behavior

Configurable per field:

```typescript
{
  name: 'author',
  type: 'relation',
  target: 'authors',
  onDelete: 'set-null',  // Options: 'cascade' | 'set-null' | 'restrict'
}
```

- `cascade` (default): Delete relation when target is deleted
- `set-null`: Set relation to null when target is deleted
- `restrict`: Prevent deletion if relations exist

---

## Slug Generation

Slugs provide URL-friendly identifiers for entries.

### Behavior

- **Auto-generation:** If `slug` is empty on create, generate from `title`
- **Uniqueness:** Slugs must be unique within a collection
- **Collision handling:** Append `-1`, `-2`, etc. for duplicates
- **Manual override:** Users can set custom slugs

### Configuration

```typescript
collections: {
  posts: {
    slug: {
      source: 'title',       // Field to generate from (default: 'title')
      unique: true,          // Enforce uniqueness (default: true)
      prefix: '',            // Optional prefix
    },
    fields: [...],
  },
}
```

### Slug Utility

```typescript
// Internal slug generation
function generateSlug(text: string): string {
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove accents
        .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric with hyphens
        .replace(/^-|-$/g, ''); // Trim leading/trailing hyphens
}
```

---

## Scheduled Publishing

Entries can be scheduled to publish at a future date.

### Behavior

- Set `status: 'scheduled'` and `publishAt: Date`
- A background job (or on-request check) transitions to `published` when `publishAt` passes
- Scheduled entries are not returned by default queries (same as drafts)

### API Usage

```typescript
// Schedule a post
await Astromech.collections.posts.update(id, {
    status: 'scheduled',
    publishAt: new Date('2025-02-01T09:00:00Z'),
});

// Query scheduled posts
const scheduled = await Astromech.collections.posts.where({
    status: 'scheduled',
});
```

### Publishing Check

On SSR request, check for due scheduled items:

```typescript
// In hooks (runs on each request)
hooks.on('api:beforeRequest', async (ctx) => {
    await publishScheduledEntries();
});

async function publishScheduledEntries() {
    const due = await db.query.entries.findMany({
        where: and(eq(entries.status, 'scheduled'), lte(entries.publishAt, new Date())),
    });

    for (const entry of due) {
        await db
            .update(entries)
            .set({ status: 'published', publishAt: null })
            .where(eq(entries.id, entry.id));
    }
}
```

---

## Soft Deletes / Trash

Deleted entries are moved to trash instead of being permanently removed.

### Behavior

- Delete sets `deletedAt` timestamp instead of removing row
- Deleted entries excluded from normal queries
- Trash can be viewed, restored, or permanently deleted
- Optional: Auto-purge after N days

### API Usage

```typescript
// Soft delete (move to trash)
await Astromech.collections.posts.delete(id);

// View trash
const trashed = await Astromech.collections.posts.trashed();

// Restore from trash
await Astromech.collections.posts.restore(id);

// Permanently delete
await Astromech.collections.posts.forceDelete(id);

// Empty trash (permanent delete all)
await Astromech.collections.posts.emptyTrash();
```

### Configuration

```typescript
astromech({
    trash: {
        enabled: true, // Default: true
        retentionDays: 30, // Auto-purge after 30 days (0 = never)
    },
});
```

### Query Behavior

```typescript
// Normal queries exclude trashed
const posts = await Astromech.collections.posts.all(); // deletedAt IS NULL

// Include trashed
const allPosts = await Astromech.collections.posts.all({ withTrashed: true });

// Only trashed
const trashedPosts = await Astromech.collections.posts.trashed();
```

---

## Translations

Multi-language content is handled via the translations plugin, which uses separate entry rows per locale linked through the `relationships` table.

### How It Works

Each locale is a separate entry row with:

- Its own `id`, `slug`, `status`, and version history
- Linked to other locales via the `relationships` table using `name: '_translations'`
- The `defaultLocale` from plugin config determines the canonical/primary locale

**Translation linking via relationships:**

```typescript
// Default locale entry → translation relationship
{
  id: 'rel-uuid-1',
  sourceId: 'post-123',      // Default locale (en-GB) entry
  sourceType: 'entry',
  name: '_translations',     // Reserved name for translation links
  targetId: 'post-456',      // Spanish translation
  targetType: 'entry',
}
```

**Entry rows:**

```typescript
// Primary entry (English - matches defaultLocale)
{
  id: 'post-123',
  locale: 'en-GB',
  slug: 'hello-world',
  status: 'published',
  fields: { title: 'Hello World', body: '...', category: 'cat-1' }
}

// Translation (Spanish) - separate row, linked via relationships table
{
  id: 'post-456',
  locale: 'es',
  slug: 'hola-mundo',          // Per-locale slug
  status: 'draft',             // Independent publishing
  fields: { title: 'Hola Mundo', body: '...', category: 'cat-1' }
}
```

### Field Translatability

Fields can be marked as translatable or shared:

```typescript
fieldGroups: [
    {
        name: 'content',
        fields: [
            { name: 'body', type: 'richtext' }, // translatable: true (default)
            { name: 'author', type: 'relation', target: 'users', translatable: false }, // Shared across locales
            { name: 'published_date', type: 'date', translatable: false }, // Shared across locales
        ],
    },
];
```

When a non-translatable field is updated on the default locale entry, hooks propagate the change to all translations.

### API Methods

```typescript
// Get all translations for an entry (for language switcher)
const translations = await Astromech.collections.posts.translations(entryId);
// Returns: [{ locale: 'en-GB', entryId: '...', slug: 'hello', status: 'published' }, ...]

// Get entry in a specific locale
const spanishPost = await Astromech.collections.posts.get(entryId, { locale: 'es' });

// Create a translation from an existing entry
const frenchPost = await Astromech.collections.posts.translate(entryId, 'fr', {
    title: 'Bonjour le monde',
    fields: { body: '...' },
});

// Query with locale filter
const publishedSpanish = await Astromech.collections.posts.where({
    locale: 'es',
    status: 'published',
});
```

### Key Behaviors

- **Per-locale versioning:** Each translation has its own version history
- **Per-locale slugs:** URLs can differ per locale (`/about` vs `/acerca-de`)
- **Independent publishing:** Each locale has its own status
- **Slug uniqueness:** Slugs must be unique per locale+collection (different locales can share slugs)

See PLUGINS.md for the translations plugin configuration.

---

## Versioning Strategy

**Approach: Separate Versions Table**

When versioning is enabled for a collection, each save creates a new version record.

```typescript
interface EntryVersion {
    id: string; // Version UUID
    entryId: string; // Parent entry ID
    versionNumber: number; // Sequential version number
    title: string;
    fields: JsonObject;
    status: 'draft' | 'published';
    createdAt: Date;
    createdBy: string;
}
```

**Behavior:**

- `entry` table holds the **current/live** version
- `entry_versions` table stores **all historical versions**
- On save: current entry → new version record, then update entry
- Restore: copy version data back to entry, increment version
- Published entries can have draft versions (changes not yet published)

**Alternative considered:** Event sourcing was too complex for the initial implementation. The separate versions table provides rollback and audit capabilities without the complexity.

---

## Type Generation

Astromech generates TypeScript types from collection definitions:

```typescript
// Generated: astromech.d.ts
declare module 'astromech' {
    interface Collections {
        pages: {
            id: string;
            slug: string | null;
            title: string;
            status: 'draft' | 'published';
            fields: {
                content: string;
                featured_image: Media | null;
            };
            createdAt: Date;
            updatedAt: Date;
        };
    }
}
```

---

## API Clients

Two clients with identical interfaces:

| Client     | Import             | Use Case                    |
| ---------- | ------------------ | --------------------------- |
| **Server** | `astromech/server` | Astro pages, endpoints, SSR |
| **Client** | `astromech/client` | React admin, external apps  |

```
┌─────────────────┐     ┌─────────────────┐
│  Server Client  │     │  Client Client  │
│  (direct)       │     │  (fetch)        │
└────────┬────────┘     └────────┬────────┘
         │                       │
         │                       ▼
         │              ┌─────────────────┐
         │              │   HTTP API      │
         │              │   /api/cms/*    │
         │              └────────┬────────┘
         │                       │
         └───────────┬───────────┘
                     │
              ┌──────▼──────┐
              │   Hooks     │
              └──────┬──────┘
                     │
              ┌──────▼──────┐
              │   Service   │
              └──────┬──────┘
                     │
              ┌──────▼──────┐
              │   Adapter   │
              └─────────────┘
```

### Server Client

Direct database access via service layer. Used in Astro server-side code.

```typescript
// src/pages/blog/[slug].astro
import { Astromech } from 'astromech/server';

const post = await Astromech.collections.posts.where({
    slug: Astro.params.slug,
    status: 'published',
});
```

### Client Client

Fetch wrapper with identical interface. Used in client-side JavaScript within the same project (monorepo).

```typescript
// src/admin/components/PostEditor.tsx
import { Astromech } from 'astromech/client';

const posts = await Astromech.collections.posts.all();
const post = await Astromech.collections.posts.update(1, {
    title: 'Updated Title',
    fields: { content: '...' },
});
```

Both clients are auto-generated from the collection config with full type safety. The client version internally fetches from the configured `apiRoute` with credentials included.

**External SDKs:** For external applications (outside the monorepo), use the REST API directly or a future standalone SDK.

### HTTP Endpoints

The client communicates with these REST endpoints:

```
GET    /api/cms/collections/:collection
POST   /api/cms/collections/:collection
GET    /api/cms/collections/:collection/:id
PUT    /api/cms/collections/:collection/:id
DELETE /api/cms/collections/:collection/:id

GET    /api/cms/collections/:collection/:id/versions
POST   /api/cms/collections/:collection/:id/restore/:versionId

GET    /api/cms/media
POST   /api/cms/media
DELETE /api/cms/media/:id

GET    /api/cms/settings
GET    /api/cms/settings/:key
PUT    /api/cms/settings/:key

GET    /api/cms/users
GET    /api/cms/users/:id
POST   /api/cms/users
PUT    /api/cms/users/:id
DELETE /api/cms/users/:id
```

---

## Hook System

Core features are built using the same hook system available to plugins. This keeps core minimal and ensures plugins have full access to extend any behavior.

```typescript
interface HookRegistry {
    // Entry lifecycle
    'entry:beforeCreate': (ctx: EntryCreateContext) => Promise<void>;
    'entry:afterCreate': (ctx: EntryCreateContext) => Promise<void>;
    'entry:beforeUpdate': (ctx: EntryUpdateContext) => Promise<void>;
    'entry:afterUpdate': (ctx: EntryUpdateContext) => Promise<void>;
    'entry:beforeDelete': (ctx: EntryDeleteContext) => Promise<void>;
    'entry:afterDelete': (ctx: EntryDeleteContext) => Promise<void>;

    // Media lifecycle
    'media:beforeUpload': (ctx: MediaUploadContext) => Promise<void>;
    'media:afterUpload': (ctx: MediaUploadContext) => Promise<void>;
    'media:beforeDelete': (ctx: MediaDeleteContext) => Promise<void>;

    // Auth lifecycle
    'auth:afterLogin': (ctx: AuthContext) => Promise<void>;
    'auth:afterLogout': (ctx: AuthContext) => Promise<void>;

    // API lifecycle
    'api:beforeRequest': (ctx: ApiRequestContext) => Promise<void>;
    'api:afterRequest': (ctx: ApiResponseContext) => Promise<void>;

    // Admin UI
    'admin:registerRoutes': (ctx: AdminRouteContext) => void;
}
```

**Usage in core (versioning as example):**

```typescript
// Versioning is a core feature, but implemented as a hook
hooks.on('entry:beforeUpdate', async (ctx) => {
    if (ctx.collection.versioning) {
        await createVersion(ctx.entry);
    }
});
```

---

## Plugin System

Plugins are npm packages that provide field groups, collections, hooks, routes, and middleware. All plugin configuration happens in the `plugins` array with declarative targeting.

### Plugin Interface

```typescript
interface AstromechPlugin {
    name: string;

    // Declarative field groups (merged at init-time)
    fieldGroups?: {
        targets: string[] | '*' | { include?: string[]; exclude?: string[] };
        groups: FieldGroup[];
    }[];

    // New collections this plugin creates
    collections?: Record<string, CollectionConfig>;

    // Runtime lifecycle hooks
    setup?: (hooks: HookRegistry, ctx: AstromechContext) => void;

    // Routes (admin pages, API endpoints, public routes)
    routes?: Route[];

    // Middleware
    middleware?: Middleware[];
}
```

### Targeting Syntax

```typescript
// All collections
targets: '*';

// Specific collections
targets: ['pages', 'posts'];

// System resources
targets: ['media', 'users'];

// Exclude pattern
targets: {
    exclude: ['redirects'];
}

// Mixed
targets: ['pages', 'posts', 'media'];
```

### How Plugins Are Processed

When `astromech()` is called, plugins are processed at init-time:

1. Field groups are merged into target collections
2. Plugin collections are added to the config
3. Routes and middleware are registered
4. Lifecycle hooks are connected

This is **not** runtime hook registration - it's declarative configuration merging.

### Example: SEO Plugin

```typescript
// @astromech/seo-plugin
import type { AstromechPlugin, FieldGroup } from 'astromech';

export function seoPlugin(options: {
    targets?: string[];
    sitemap?: boolean;
}): AstromechPlugin {
    return {
        name: 'seo',

        fieldGroups: [
            {
                targets: options.targets ?? '*',
                groups: [
                    {
                        name: 'seo',
                        label: 'SEO',
                        location: 'sidebar',
                        priority: 10,
                        collapsed: true,
                        fields: [
                            { name: 'meta_title', type: 'text', label: 'Meta Title' },
                            {
                                name: 'meta_description',
                                type: 'textarea',
                                label: 'Meta Description',
                            },
                            { name: 'og_image', type: 'media', label: 'Social Image' },
                        ],
                    },
                ],
            },
        ],

        routes: options.sitemap
            ? [{ path: '/sitemap.xml', handler: sitemapHandler }]
            : [],

        setup(hooks) {
            if (options.sitemap) {
                hooks.on('entry:afterCreate', regenerateSitemap);
                hooks.on('entry:afterUpdate', regenerateSitemap);
                hooks.on('entry:afterDelete', regenerateSitemap);
            }
        },
    };
}
```

### Example: Redirects Plugin

```typescript
// @astromech/redirects-plugin
import type { AstromechPlugin } from 'astromech';

export function redirectsPlugin(options: {
    generateOnSlugChange?: boolean;
}): AstromechPlugin {
    return {
        name: 'redirects',

        // Plugin creates its own collection
        collections: {
            redirects: {
                fieldGroups: [
                    {
                        name: 'redirect',
                        label: 'Redirect',
                        location: 'main',
                        priority: 0,
                        fields: [
                            {
                                name: 'from',
                                type: 'text',
                                required: true,
                                label: 'From Path',
                            },
                            {
                                name: 'to',
                                type: 'text',
                                required: true,
                                label: 'To Path',
                            },
                            {
                                name: 'type',
                                type: 'select',
                                options: ['301', '302'],
                                defaultValue: '301',
                            },
                        ],
                    },
                ],
            },
        },

        // Middleware for handling redirects
        middleware: [redirectMiddleware],

        setup(hooks, ctx) {
            if (options.generateOnSlugChange) {
                hooks.on('entry:beforeUpdate', async (entryCtx) => {
                    const oldSlug = entryCtx.entry.slug;
                    const newSlug = entryCtx.data.slug;
                    if (oldSlug && newSlug && oldSlug !== newSlug) {
                        await ctx.collections.redirects.create({
                            from: `/${oldSlug}`,
                            to: `/${newSlug}`,
                            type: '301',
                        });
                    }
                });
            }
        },
    };
}
```

### Example: Image Optimizer Plugin

```typescript
// @astromech/image-optimizer
import type { AstromechPlugin } from 'astromech';

export function imageOptimizerPlugin(options?: {
    quality?: number;
    maxWidth?: number;
}): AstromechPlugin {
    return {
        name: 'image-optimizer',

        setup(hooks) {
            hooks.on('media:afterUpload', async (ctx) => {
                if (ctx.media.mimeType.startsWith('image/')) {
                    await optimizeImage(ctx.media, options);
                }
            });
        },
    };
}
```

### User Configuration

```typescript
import { seoPlugin } from '@astromech/seo-plugin';
import { redirectsPlugin } from '@astromech/redirects-plugin';
import { imageOptimizerPlugin } from '@astromech/image-optimizer';

astromech({
    collections: {
        pages: {
            fieldGroups: [
                /* user-defined content fields */
            ],
        },
        posts: {
            versioning: true,
            fieldGroups: [
                /* user-defined content fields */
            ],
        },
    },

    plugins: [
        seoPlugin({
            targets: ['pages', 'posts'],
            sitemap: true,
        }),
        redirectsPlugin({
            generateOnSlugChange: true,
        }),
        imageOptimizerPlugin({
            quality: 80,
            maxWidth: 2000,
        }),
    ],
});
```

---

## Admin UI Architecture

Server-rendered Astro pages with React islands for interactive components.

**Architecture Pattern:** Astro + React Islands (not a full SPA)

**Why Islands:**

- Performance: ~30-40KB bundle (only interactive parts) vs 65-100KB for full SPA
- Progressive Enhancement: Simple forms work without JavaScript
- Development Velocity: Keep working Astro templates, add React only where needed
- Alignment: Exactly what Astro was designed for

**Field Type Strategy:**

- Simple field types use native HTML inputs (text, number, date, select, boolean, etc.)
- Complex field types use React components with `client:load` hydration:
    - `richtext` - TipTap editor
    - `media` - Upload picker with preview
    - `relation` - Searchable combobox
    - `repeater` - Add/remove/reorder controls
    - `multiselect` - Multi-select dropdown
    - `json` - Monaco editor (lazy loaded, future)
    - `builder` - Block-based editor (future)
    - `group` - Collapsible sections

**Form Submission:** Progressive enhancement with HTML forms + POST. Islands update hidden inputs on change. Server handles submission (no fetch API needed initially). Can add optimistic updates later without rewrite.

**Directory Structure:**

```
admin/
├── components/
│   ├── layout/
│   ├── collections/
│   ├── fields/           # Field type renderers
│   └── ui/               # BEM-styled components
├── pages/
│   ├── Dashboard.tsx
│   ├── CollectionList.tsx
│   ├── EntryEdit.tsx
│   ├── MediaLibrary.tsx
│   └── Settings.tsx
├── hooks/
├── api/                  # API client
├── styles/
│   ├── tokens.css        # CSS custom properties (design tokens)
│   ├── base.css          # Reset and base styles
│   └── components/       # Component-specific styles
└── App.tsx
```

### Styling Approach

Modern CSS with BEM-like naming for easy theming:

**Design Tokens (CSS Custom Properties):**

```css
/* styles/tokens.css */
:root {
    /* Colors */
    --am-color-primary: #3b82f6;
    --am-color-primary-hover: #2563eb;
    --am-color-background: #ffffff;
    --am-color-surface: #f8fafc;
    --am-color-border: #e2e8f0;
    --am-color-text: #1e293b;
    --am-color-text-muted: #64748b;
    --am-color-danger: #ef4444;
    --am-color-success: #22c55e;

    /* Spacing */
    --am-space-xs: 0.25rem;
    --am-space-sm: 0.5rem;
    --am-space-md: 1rem;
    --am-space-lg: 1.5rem;
    --am-space-xl: 2rem;

    /* Typography */
    --am-font-family: system-ui, -apple-system, sans-serif;
    --am-font-size-sm: 0.875rem;
    --am-font-size-base: 1rem;
    --am-font-size-lg: 1.125rem;
    --am-font-size-xl: 1.25rem;

    /* Borders */
    --am-radius-sm: 0.25rem;
    --am-radius-md: 0.375rem;
    --am-radius-lg: 0.5rem;

    /* Shadows */
    --am-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
    --am-shadow-md: 0 4px 6px rgba(0, 0, 0, 0.1);
}

/* Dark theme override */
[data-theme='dark'] {
    --am-color-background: #0f172a;
    --am-color-surface: #1e293b;
    --am-color-border: #334155;
    --am-color-text: #f1f5f9;
    --am-color-text-muted: #94a3b8;
}
```

**BEM-like Class Naming:**

```css
/* Block */
.am-button {
}

/* Element */
.am-button__icon {
}
.am-button__label {
}

/* Modifier */
.am-button--primary {
}
.am-button--danger {
}
.am-button--small {
}
```

**Component Example:**

```css
/* styles/components/button.css */
.am-button {
    display: inline-flex;
    align-items: center;
    gap: var(--am-space-sm);
    padding: var(--am-space-sm) var(--am-space-md);
    font-size: var(--am-font-size-base);
    font-family: var(--am-font-family);
    border-radius: var(--am-radius-md);
    border: 1px solid var(--am-color-border);
    background: var(--am-color-surface);
    color: var(--am-color-text);
    cursor: pointer;
    transition:
        background-color 0.15s,
        border-color 0.15s;
}

.am-button:hover {
    background: var(--am-color-border);
}

.am-button--primary {
    background: var(--am-color-primary);
    border-color: var(--am-color-primary);
    color: white;
}

.am-button--primary:hover {
    background: var(--am-color-primary-hover);
}

.am-button--danger {
    background: var(--am-color-danger);
    border-color: var(--am-color-danger);
    color: white;
}

.am-button__icon {
    width: 1em;
    height: 1em;
}
```

**Theming:**

Users can override design tokens to customize the admin UI:

```css
/* Custom theme */
:root {
    --am-color-primary: #8b5cf6; /* Purple instead of blue */
    --am-radius-md: 0; /* Sharp corners */
}
```

---

## Database Schema (Drizzle)

```typescript
// Roles table
export const roles = sqliteTable('roles', {
    slug: text('slug').primaryKey(), // e.g., 'admin', 'editor', 'blog_editor'
    name: text('name').notNull(), // Display name
    permissions: text('permissions', { mode: 'json' }).$type<string[]>().notNull(),
    isBuiltIn: integer('is_built_in', { mode: 'boolean' }).default(false),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// Users table
export const users = sqliteTable('users', {
    id: text('id').primaryKey(),
    email: text('email').notNull().unique(),
    name: text('name'),
    roleSlug: text('role_slug')
        .notNull()
        .references(() => roles.slug)
        .default('editor'),
    fields: text('fields', { mode: 'json' }), // Custom profile fields
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const entries = sqliteTable(
    'entries',
    {
        id: text('id').primaryKey(), // UUID
        collectionId: text('collection_id').notNull(),

        // Translation support (nullable for non-i18n collections)
        // Translations are linked via relationships table with name: '_translations'
        locale: text('locale'), // e.g., 'en-GB', 'es'

        slug: text('slug').unique(),
        title: text('title').notNull(),
        fields: text('fields', { mode: 'json' }),
        status: text('status', { enum: ['draft', 'published', 'scheduled'] }).default(
            'draft'
        ),
        publishAt: integer('publish_at', { mode: 'timestamp' }), // Scheduled publish date
        deletedAt: integer('deleted_at', { mode: 'timestamp' }), // Soft delete timestamp

        createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
        updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
        createdBy: text('created_by').references(() => users.id),
        updatedBy: text('updated_by').references(() => users.id),
    },
    (table) => ({
        localeIdx: index('idx_locale_lookup').on(
            table.collectionId,
            table.locale,
            table.status
        ),
    })
);

export const entryVersions = sqliteTable('entry_versions', {
    id: text('id').primaryKey(),
    entryId: text('entry_id')
        .notNull()
        .references(() => entries.id, { onDelete: 'cascade' }),
    versionNumber: integer('version_number').notNull(),
    title: text('title').notNull(),
    fields: text('fields', { mode: 'json' }),
    status: text('status', { enum: ['draft', 'published', 'scheduled'] }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    createdBy: text('created_by').references(() => users.id),
});

// Polymorphic relationships table (entry↔entry, entry↔user, etc.)
// All IDs are UUIDs. Collection info is not stored here since entries already have collection_id.
export const relationships = sqliteTable(
    'relationships',
    {
        id: text('id').primaryKey(), // UUID
        sourceId: text('source_id').notNull(), // UUID
        sourceType: text('source_type', { enum: ['entry', 'user', 'media'] }).notNull(),
        name: text('name').notNull(), // e.g., 'author', 'category', '_translations'
        targetId: text('target_id').notNull(), // UUID
        targetType: text('target_type', { enum: ['entry', 'user', 'media'] }).notNull(),
        position: integer('position').default(0),
        createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    },
    (table) => ({
        sourceIdx: index('idx_rel_source').on(
            table.sourceId,
            table.sourceType,
            table.name
        ),
        targetIdx: index('idx_rel_target').on(table.targetId, table.targetType),
    })
);

export const media = sqliteTable('media', {
    id: text('id').primaryKey(),
    filename: text('filename').notNull(),
    mimeType: text('mime_type').notNull(),
    size: integer('size').notNull(),
    url: text('url').notNull(),
    alt: text('alt'),
    fields: text('fields', { mode: 'json' }), // Custom metadata fields
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    createdBy: text('created_by').references(() => users.id),
});

export const settings = sqliteTable('settings', {
    key: text('key').primaryKey(),
    value: text('value', { mode: 'json' }),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});
```

---

## Coding Standards

### TypeScript Configuration

```json
{
    "compilerOptions": {
        "strict": true,
        "noUncheckedIndexedAccess": true,
        "noImplicitOverride": true,
        "exactOptionalPropertyTypes": true,
        "moduleResolution": "bundler",
        "target": "ES2022",
        "lib": ["ES2022"]
    }
}
```

### Code Style

**General:**

- Use `type` over `interface` unless extending/declaration merging is needed
- Use `import type { }` for type-only imports
- Prefer `unknown` over `any`; never use `any` in committed code
- Prefer `const` assertions and literal types where applicable
- Self-documenting code over comments; reserve comments for non-obvious "why"

**Naming:**

- Files: `kebab-case.ts`
- Types/Interfaces: `PascalCase`
- Functions/variables: `camelCase`
- Constants: `SCREAMING_SNAKE_CASE` for true constants, `camelCase` for derived values

**Functions:**

- Explicit return types on exported functions
- Prefer named exports over default exports
- Async functions should handle errors or explicitly propagate them

**Imports:**

- Group: external deps → internal absolute → relative
- Sort alphabetically within groups

### Tooling

**ESLint:** `@typescript-eslint/recommended-type-checked` + `@typescript-eslint/stylistic-type-checked`

**Prettier:**

```json
{
    "semi": true,
    "singleQuote": true,
    "trailingComma": "es5",
    "printWidth": 100,
    "tabWidth": 2
}
```

### Testing

- Vitest for unit/integration tests
- Test files: `*.test.ts` colocated with source
- Mock external dependencies, not internal modules
- Focus on behavior, not implementation details

### Git

- Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`
- Feature branches off `main`
- Squash merge to main

---

## Future Considerations

1. **Full-text search:** D1 supports SQLite FTS5. Evaluate when needed.

2. **Multi-language content:** See Translations section and `@astromech/translations-plugin` in PLUGINS.md.
