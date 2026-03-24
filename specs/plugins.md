# Core Plugins

Plugins use declarative targeting to add field groups, collections, hooks, routes, and middleware.

## Configuration Pattern

```typescript
import { seoPlugin } from '@astromech/seo-plugin';
import { redirectsPlugin } from '@astromech/redirects-plugin';
import { analyticsPlugin } from '@astromech/analytics-plugin';

astromech({
  collections: {
    pages: {
      fieldGroups: [/* user content fields */],
    },
    posts: {
      versioning: true,
      fieldGroups: [/* user content fields */],
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
    analyticsPlugin(),
  ],
});
```

---

## SEO Plugin

Adds SEO meta fields, sitemap generation, and frontend components.

### Features

- Field group with meta title, description, OG image
- `<SEO />` component for frontend `<head>`
- Sitemap generation at `/sitemap.xml`
- Schema markup generation (advanced)
- llms.txt generation (advanced)

### Implementation

```typescript
// @astromech/seo-plugin
import type { AstromechPlugin } from 'astromech';

export function seoPlugin(options: {
  targets?: string[];
  sitemap?: boolean;
  sitemapPath?: string;
}): AstromechPlugin {
  return {
    name: 'seo',

    fieldGroups: [{
      targets: options.targets ?? '*',
      groups: [{
        name: 'seo',
        label: 'SEO',
        location: 'sidebar',
        priority: 10,
        collapsed: true,
        fields: [
          { name: 'meta_title', type: 'text', label: 'Meta Title' },
          { name: 'meta_description', type: 'textarea', label: 'Meta Description' },
          { name: 'og_image', type: 'media', label: 'Social Image' },
          { name: 'noindex', type: 'boolean', label: 'Exclude from search engines' },
        ],
      }],
    }],

    routes: options.sitemap ? [
      { path: options.sitemapPath ?? '/sitemap.xml', handler: sitemapHandler },
    ] : [],

    setup(hooks) {
      if (options.sitemap) {
        hooks.on('entity:afterCreate', regenerateSitemap);
        hooks.on('entity:afterUpdate', regenerateSitemap);
        hooks.on('entity:afterDelete', regenerateSitemap);
      }
    },
  };
}

// Frontend component (separate export)
export { SEO } from './components/SEO';
```

### Usage

```typescript
// Config
seoPlugin({
  targets: ['pages', 'posts'],  // Only these collections get SEO fields
  sitemap: true,
})

// Frontend (Astro page)
import { SEO } from '@astromech/seo-plugin';

<SEO entity={page} />
```

---

## Redirects Plugin

Manages URL redirects with automatic creation on slug changes.

### Features

- `redirects` collection for CRUD management
- Middleware for redirect handling
- Auto-create redirects when entity slugs change

### Implementation

```typescript
// @astromech/redirects-plugin
import type { AstromechPlugin } from 'astromech';

export function redirectsPlugin(options?: {
  generateOnSlugChange?: boolean;
}): AstromechPlugin {
  return {
    name: 'redirects',

    collections: {
      redirects: {
        fieldGroups: [{
          name: 'redirect',
          label: 'Redirect',
          location: 'main',
          priority: 0,
          fields: [
            { name: 'from', type: 'text', required: true, label: 'From Path' },
            { name: 'to', type: 'text', required: true, label: 'To Path' },
            {
              name: 'type',
              type: 'select',
              label: 'Redirect Type',
              options: [
                { value: '301', label: 'Permanent (301)' },
                { value: '302', label: 'Temporary (302)' },
              ],
              defaultValue: '301',
            },
            { name: 'enabled', type: 'boolean', defaultValue: true },
          ],
        }],
      },
    },

    middleware: [redirectMiddleware],

    setup(hooks, ctx) {
      if (options?.generateOnSlugChange) {
        hooks.on('entity:beforeUpdate', async (entityCtx) => {
          const oldSlug = entityCtx.entity.slug;
          const newSlug = entityCtx.data.slug;
          if (oldSlug && newSlug && oldSlug !== newSlug) {
            await ctx.collections.redirects.create({
              title: `Redirect: ${oldSlug}`,
              fields: {
                from: `/${oldSlug}`,
                to: `/${newSlug}`,
                type: '301',
                enabled: true,
              },
            });
          }
        });
      }
    },
  };
}
```

---

## Translations Plugin

Enables multi-language content with per-locale versioning, slugs, and publishing.

### Features

- Separate entity row per locale (linked by `translationGroupId`)
- Per-locale versioning, slugs, and publish status
- Opt-in field translatability (`translatable: false` for shared fields)
- Automatic sync of non-translatable fields across locales
- Language switcher UI in admin
- API methods for querying and creating translations

### Implementation

```typescript
// @astromech/translations-plugin
import type { AstromechPlugin } from 'astromech';

export function translationsPlugin(options: {
  targets: string[];
  locales: string[];
  defaultLocale: string;
  syncNonTranslatable?: boolean;  // Default: true
}): AstromechPlugin {
  return {
    name: 'translations',

    // Add locale switcher to targeted collections
    fieldGroups: [{
      targets: options.targets,
      groups: [{
        name: 'translations',
        label: 'Translations',
        location: 'sidebar',
        priority: 5,
        fields: [
          {
            name: '_locale',
            type: 'locale-switcher',
            locales: options.locales,
            defaultLocale: options.defaultLocale,
          },
        ],
      }],
    }],

    // Admin routes for translation management
    routes: [
      { path: '/admin/translations/:entityId', handler: translationManagerPage },
    ],

    setup(hooks, ctx) {
      // Sync non-translatable fields across locales
      if (options.syncNonTranslatable !== false) {
        hooks.on('entity:afterUpdate', async (entityCtx) => {
          // Only sync from default locale to translations
          if (entityCtx.entity.locale !== options.defaultLocale) return;
          if (!options.targets.includes(entityCtx.collection)) return;

          const collection = ctx.config.collections[entityCtx.collection];
          const nonTranslatableFields = getNonTranslatableFields(collection);
          if (nonTranslatableFields.length === 0) return;

          // Get all translations via relationships table
          const translationRels = await ctx.db.query.relationships.findMany({
            where: and(
              eq(relationships.sourceId, entityCtx.entity.id),
              eq(relationships.sourceType, 'entity'),
              eq(relationships.name, '_translations')
            ),
          });

          // Fetch and sync each translation
          for (const rel of translationRels) {
            const translation = await ctx.db.query.entities.findFirst({
              where: eq(entities.id, rel.targetId),
            });
            if (!translation) continue;

            const fieldsToSync: Record<string, unknown> = {};
            for (const fieldName of nonTranslatableFields) {
              if (fieldName in entityCtx.data.fields) {
                fieldsToSync[fieldName] = entityCtx.data.fields[fieldName];
              }
            }

            if (Object.keys(fieldsToSync).length > 0) {
              await ctx.collections[entityCtx.collection].update(translation.id, {
                fields: { ...translation.fields, ...fieldsToSync },
              }, { skipHooks: ['entity:afterUpdate'] });  // Prevent infinite loop
            }
          }
        });
      }

      // Set default locale on entity creation
      hooks.on('entity:beforeCreate', async (entityCtx) => {
        if (!options.targets.includes(entityCtx.collection)) return;

        // If no locale specified, use default locale
        if (!entityCtx.data.locale) {
          entityCtx.data.locale = options.defaultLocale;
        }
      });

      // Link translation to default locale entity after creation
      hooks.on('entity:afterCreate', async (entityCtx) => {
        if (!options.targets.includes(entityCtx.collection)) return;
        if (!entityCtx.data._translateFrom) return;  // Only for translations

        // Create relationship from default locale to this translation
        await ctx.db.insert(relationships).values({
          id: crypto.randomUUID(),
          sourceId: entityCtx.data._translateFrom,  // Default locale entity ID
          sourceType: 'entity',
          name: '_translations',
          targetId: entityCtx.entity.id,
          targetType: 'entity',
          createdAt: new Date(),
        });
      });
    },
  };
}

function getNonTranslatableFields(collection: CollectionConfig): string[] {
  const fields: string[] = [];
  for (const group of collection.fieldGroups) {
    for (const field of group.fields) {
      if (field.translatable === false) {
        fields.push(field.name);
      }
    }
  }
  return fields;
}
```

### Usage

```typescript
// Config
astromech({
  collections: {
    posts: {
      versioning: true,
      fieldGroups: [{
        name: 'content',
        label: 'Content',
        location: 'main',
        fields: [
          { name: 'body', type: 'richtext' },  // translatable (default)
          { name: 'author', type: 'relation', target: 'users', translatable: false },
          { name: 'published_date', type: 'date', translatable: false },
        ],
      }],
    },
  },

  plugins: [
    translationsPlugin({
      targets: ['posts', 'pages'],
      locales: ['en-GB', 'es', 'fr'],
      defaultLocale: 'en-GB',
    }),
  ],
});
```

### API Methods

```typescript
// Get all translations for an entity (language switcher)
const translations = await Astromech.collections.posts.translations(postId);
// Returns: [{ locale: 'en-GB', entityId: '...', slug: 'hello', status: 'published' }, ...]

// Get entity in specific locale
const spanish = await Astromech.collections.posts.get(postId, { locale: 'es' });

// Create translation from existing entity
const french = await Astromech.collections.posts.translate(postId, 'fr', {
  title: 'Bonjour',
  fields: { body: '...' },
});

// Query with locale filter
const published = await Astromech.collections.posts.where({
  locale: 'es',
  status: 'published',
});
```

### Admin UI

1. **Entity list** shows primary locale by default with locale badge
2. **Locale switcher** in sidebar shows available translations with status
3. **"Add translation"** creates new locale row with non-translatable fields copied
4. **Editing translation** shows translatable fields (non-translatable shown read-only)

---

## Analytics Plugin

Manages tracking scripts and provides analytics dashboard.

### Features

- Admin UI for managing tracking scripts (GA4, FB Pixel, etc.)
- `<Analytics />` component for frontend
- Optional GA4 dashboard integration

### Implementation

```typescript
// @astromech/analytics-plugin
import type { AstromechPlugin } from 'astromech';

export function analyticsPlugin(options?: {
  dashboard?: boolean;
}): AstromechPlugin {
  return {
    name: 'analytics',

    // Admin routes for script management
    routes: [
      { path: '/admin/analytics', handler: analyticsSettingsPage },
      ...(options?.dashboard ? [
        { path: '/admin/analytics/dashboard', handler: analyticsDashboard },
      ] : []),
    ],
  };
}

// Frontend component
export { Analytics } from './components/Analytics';
```

### Usage

```typescript
// Frontend (Astro layout)
import { Analytics } from '@astromech/analytics-plugin';

<Analytics />  // Renders configured tracking scripts
```

---

## Security Plugin

Adds 2FA and audit logging.

### Features

- Two-factor authentication (TOTP)
- Audit log for all CMS actions
- Admin UI for viewing audit log

### Implementation

```typescript
// @astromech/security-plugin
import type { AstromechPlugin } from 'astromech';

export function securityPlugin(options?: {
  twoFactor?: boolean;
  auditLog?: boolean;
}): AstromechPlugin {
  return {
    name: 'security',

    collections: options?.auditLog ? {
      audit_log: {
        fieldGroups: [{
          name: 'entry',
          label: 'Audit Entry',
          location: 'main',
          priority: 0,
          fields: [
            { name: 'action', type: 'text' },
            { name: 'resource', type: 'text' },
            { name: 'resource_id', type: 'text' },
            { name: 'user_id', type: 'relation', target: 'users' },
            { name: 'metadata', type: 'json' },
          ],
        }],
      },
    } : undefined,

    routes: [
      ...(options?.auditLog ? [
        { path: '/admin/audit-log', handler: auditLogPage },
      ] : []),
    ],

    setup(hooks, ctx) {
      // 2FA hooks
      if (options?.twoFactor) {
        hooks.on('auth:afterLogin', async (authCtx) => {
          if (authCtx.user.twoFactorEnabled) {
            // Redirect to 2FA verification
          }
        });
      }

      // Audit logging
      if (options?.auditLog) {
        hooks.on('entity:afterCreate', (entityCtx) => logAction('create', entityCtx));
        hooks.on('entity:afterUpdate', (entityCtx) => logAction('update', entityCtx));
        hooks.on('entity:afterDelete', (entityCtx) => logAction('delete', entityCtx));
      }
    },
  };
}
```

---

## Forms Plugin

Creates and manages forms with submissions.

### Features

- `forms` and `form_submissions` collections
- Form builder UI
- `<Form />` component for frontend
- `getForm(id)` API for fetching form config

### Implementation

```typescript
// @astromech/forms-plugin
import type { AstromechPlugin } from 'astromech';

export function formsPlugin(): AstromechPlugin {
  return {
    name: 'forms',

    collections: {
      forms: {
        fieldGroups: [{
          name: 'form',
          label: 'Form',
          location: 'main',
          priority: 0,
          fields: [
            { name: 'fields', type: 'repeater', label: 'Form Fields', fields: [
              { name: 'name', type: 'text', required: true },
              { name: 'type', type: 'select', options: ['text', 'email', 'textarea', 'select', 'checkbox'] },
              { name: 'label', type: 'text', required: true },
              { name: 'required', type: 'boolean' },
              { name: 'options', type: 'textarea', description: 'For select fields, one option per line' },
            ]},
            { name: 'submit_label', type: 'text', defaultValue: 'Submit' },
            { name: 'success_message', type: 'textarea' },
            { name: 'notification_email', type: 'text' },
          ],
        }],
      },
      form_submissions: {
        fieldGroups: [{
          name: 'submission',
          label: 'Submission',
          location: 'main',
          priority: 0,
          fields: [
            { name: 'form_id', type: 'relation', target: 'forms' },
            { name: 'data', type: 'json' },
            { name: 'ip_address', type: 'text' },
            { name: 'user_agent', type: 'text' },
          ],
        }],
      },
    },

    routes: [
      { path: '/api/forms/:id/submit', handler: formSubmitHandler, method: 'POST' },
    ],
  };
}

// Frontend exports
export { Form } from './components/Form';
export { getForm } from './api';
```

### Usage

```typescript
// Frontend (Astro page)
import { Form, getForm } from '@astromech/forms-plugin';

const contactForm = await getForm('contact');

<Form form={contactForm} />
```

---

## Plugin Interface Reference

```typescript
interface AstromechPlugin {
  name: string;

  // Declarative field groups with targeting
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
