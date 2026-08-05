import { fileURLToPath } from 'node:url';
import {
    builtInRole,
    ConsoleDriver,
    defineAdminPage,
    defineConfig,
    entryPermissions,
    libsqlDriver,
} from 'astromech';
import { sharp } from 'astromech/media/image/sharp';
import { filesystem } from 'astromech/storage/filesystem';
import * as fields from 'astromech/fields';
import { anthropic } from '@ai-sdk/anthropic';
import { assistant } from '@astromech/assistant';
import { redirects } from '@astromech/redirects';
import { seo, seoSection } from '@astromech/seo';
import { menus } from '@astromech/menus';
import { backups } from '@astromech/backups';
import { forms } from '@astromech/forms';
import { rating } from './src/plugins/rating/index.js';
import { author } from './src/entries/author.js';

// ---------------------------------------------------------------------------
// Block catalog — shared by `page` and `caseStudy`
// ---------------------------------------------------------------------------
const blockCatalog = [
    fields.block('hero', {
        label: 'Hero',
        fields: [
            fields.text('heading', { label: 'Heading', required: true }),
            fields.textarea('subheading', { label: 'Subheading' }),
            fields.link('cta', { label: 'CTA' }),
            fields.media('image', { label: 'Image' }),
        ],
    }),
    fields.block('richText', {
        label: 'Rich Text',
        fields: [fields.richtext('body', { label: 'Body', required: true })],
    }),
    fields.block('featureGrid', {
        label: 'Feature Grid',
        fields: [
            fields.text('heading', { label: 'Heading' }),
            fields.repeater('features', {
                label: 'Features',
                fields: [
                    fields.text('title', { label: 'Title' }),
                    fields.textarea('description', { label: 'Description' }),
                    fields.text('icon', { label: 'Icon' }),
                ],
            }),
        ],
    }),
    fields.block('media', {
        label: 'Media',
        fields: [
            fields.media('image', { label: 'Image', required: true }),
            fields.text('caption', { label: 'Caption' }),
        ],
    }),
    fields.block('cta', {
        label: 'Call to Action',
        fields: [
            fields.text('heading', { label: 'Heading' }),
            fields.textarea('text', { label: 'Text' }),
            fields.link('button', { label: 'Button' }),
        ],
    }),
    fields.block('testimonial', {
        label: 'Testimonial',
        fields: [
            fields.textarea('quote', { label: 'Quote', required: true }),
            fields.text('author', { label: 'Author' }),
            fields.text('role', { label: 'Role' }),
            fields.media('avatar', { label: 'Avatar' }),
        ],
    }),
    fields.block('logoCloud', {
        label: 'Logo Cloud',
        fields: [
            fields.text('heading', { label: 'Heading' }),
            fields.media('logos', { label: 'Logos', multiple: true }),
        ],
    }),
    fields.block('faq', {
        label: 'FAQ',
        fields: [
            fields.text('heading', { label: 'Heading' }),
            fields.repeater('items', {
                label: 'Items',
                fields: [
                    fields.text('question', { label: 'Question' }),
                    fields.textarea('answer', { label: 'Answer' }),
                ],
            }),
        ],
    }),
    fields.block('stats', {
        label: 'Stats',
        fields: [
            fields.repeater('items', {
                label: 'Items',
                fields: [
                    fields.text('value', { label: 'Value' }),
                    fields.text('label', { label: 'Label' }),
                ],
            }),
        ],
    }),
    fields.block('twoColumn', {
        label: 'Two Column',
        fields: [
            fields.richtext('left', { label: 'Left' }),
            fields.richtext('right', { label: 'Right' }),
        ],
    }),
];

export default defineConfig({
    db: libsqlDriver({
        url: 'file:' + fileURLToPath(new URL('./database.db', import.meta.url)),
    }),
    storage: filesystem({ dir: './public/uploads', urlPrefix: '/uploads' }),
    // The demo sends nothing real — the console driver prints each message so
    // form notifications (and anything else that emails) are visible in the dev
    // server output. Without an `email` block at all, `ctx.sendEmail` throws and
    // plugins can only log the failure.
    email: { driver: new ConsoleDriver(), from: 'demo@astromech.dev' },
    image: { driver: sharp() },
    // `anthropic()` reads ANTHROPIC_API_KEY from the environment. The model
    // is a live object, so it reaches the runtime through this config and
    // never through the virtual config, which is JSON.
    ai: {
        model: anthropic('claude-opus-5'),
        models: { assistant: anthropic('claude-opus-5') },
    },
    locales: ['en', 'fr'],
    defaultLocale: 'en-GB',
    plugins: [
        redirects(),
        seo(),
        backups(),
        assistant(),
        menus({
            menus: [
                { key: 'main', label: 'Main Navigation' },
                { key: 'footer', label: 'Footer' },
            ],
        }),
        rating(),
        // No `spam` provider configured — the demo has no Turnstile/reCAPTCHA
        // keys, and a configured provider would fail every seeded submission's
        // gate. A real site would pass something like:
        // forms({ spam: turnstile({ siteKey: '…', secretKey: import.meta.env.TURNSTILE_SECRET }) })
        forms(),
    ],
    roles: {
        'content-editor': {
            name: 'Content Editor',
            permissions: [
                ...builtInRole('editor'),
                ...seo.permissions('view'),
                // Redirects declares no permissions — its entry type's are
                // derived by core, so a site enumerates the actions it grants.
                ...entryPermissions(
                    'redirects/redirect',
                    'read',
                    'create',
                    'update',
                    'delete'
                ),
                ...entryPermissions('forms/form', 'read', 'create', 'update', 'delete'),
                // `read` + `delete` only — submissions are written by the public
                // API and must not be hand-authored or edited. This is v1's
                // stand-in for a read-only entry flag, which core does not have.
                ...entryPermissions('forms/submission', 'read', 'delete'),
                // `read` alone — a content editor has no business downloading,
                // restoring or deleting the database.
                ...backups.permissions('read'),
                ...assistant.permissions('use'),
            ],
        },
    },

    entries: {
        page: {
            single: 'Page',
            plural: 'Pages',
            icon: 'FileText',
            translatable: true,
            versioning: true,
            staging: true,
            url: '/{slug}',
            fields: {
                main: [
                    fields.blocks('content', { blocks: blockCatalog }),
                    fields.tabs({
                        fields: [
                            fields.tab('seo', { label: 'SEO', fields: [seoSection()] }),
                            fields.tab('social', {
                                label: 'Social',
                                fields: [
                                    fields.section('og', {
                                        label: 'Open Graph',
                                        fields: [
                                            fields.text('ogTitle', {
                                                label: 'Open Graph Title',
                                            }),
                                            fields.media('ogImage', {
                                                label: 'Open Graph Image',
                                            }),
                                            {
                                                name: 'contentQuality',
                                                type: 'rating',
                                                label: 'Content Quality',
                                            },
                                        ],
                                    }),
                                ],
                            }),
                        ],
                    }),
                ],
                sidebar: [
                    fields.section('settings', {
                        label: 'Settings',
                        fields: [
                            fields.relationship('parent', {
                                label: 'Parent Page',
                                target: 'page',
                            }),
                            fields.boolean('noindex', {
                                label: 'No Index',
                                translatable: false,
                            }),
                            fields.color('themeColor', {
                                label: 'Theme Color',
                                translatable: false,
                            }),
                        ],
                    }),
                ],
            },
        },

        post: {
            single: 'Post',
            plural: 'Posts',
            icon: 'Newspaper',
            translatable: true,
            versioning: true,
            staging: true,
            url: '/blog/{slug}',
            views: ['list', 'grid'],
            defaultView: 'list',
            gridFields: [{ field: 'excerpt', label: 'Excerpt' }],
            fields: {
                main: [
                    fields.richtext('body', { required: true }),
                    fields.textarea('excerpt'),
                    fields.date('publishedDate', { label: 'Published Date' }),
                    seoSection(),
                ],
                sidebar: [
                    fields.section('taxonomy', {
                        label: 'Taxonomy',
                        fields: [
                            fields.media('featured_image', {
                                label: 'Featured Image',
                                translatable: false,
                            }),
                            fields.relationship('category', { target: 'category' }),
                            fields.relationship('tags', {
                                target: 'tag',
                                multiple: true,
                            }),
                            fields.relationship('author', { target: 'author' }),
                        ],
                    }),
                ],
            },
        },

        // Declared in its own module with `defineEntryType`; every other type
        // here is inline. Both are supported — see apps/docs/content/entry-types.md.
        author,

        caseStudy: {
            single: 'Case Study',
            plural: 'Case Studies',
            icon: 'BookOpen',
            translatable: true,
            url: '/customers/{slug}',
            fields: {
                main: [
                    fields.text('customer', { label: 'Customer', required: true }),
                    fields.select('industry', {
                        label: 'Industry',
                        options: ['saas', 'ecommerce', 'agency', 'media', 'education'],
                    }),
                    fields.textarea('summary', { label: 'Summary' }),
                    fields.blocks('content', { blocks: blockCatalog }),
                    fields.repeater('metrics', {
                        label: 'Metrics',
                        fields: [
                            fields.text('value', { label: 'Value' }),
                            fields.text('label', { label: 'Label' }),
                        ],
                    }),
                    fields.group('quote', {
                        label: 'Quote',
                        fields: [
                            fields.textarea('text', { label: 'Text' }),
                            fields.text('author', { label: 'Author' }),
                            fields.text('role', { label: 'Role' }),
                        ],
                    }),
                    { name: 'contentQuality', type: 'rating', label: 'Content Quality' },
                    seoSection(),
                ],
                sidebar: [
                    fields.media('logo', { label: 'Logo', translatable: false }),
                    fields.media('gallery', {
                        label: 'Gallery',
                        multiple: true,
                        translatable: false,
                    }),
                    fields.relationship('related_posts', {
                        target: 'post',
                        multiple: true,
                        label: 'Related Posts',
                    }),
                ],
            },
        },

        category: {
            single: 'Category',
            plural: 'Categories',
            icon: 'FolderTree',
            translatable: true,
            url: '/blog/category/{slug}',
            fields: [fields.textarea('description', { label: 'Description' })],
        },

        tag: {
            single: 'Tag',
            plural: 'Tags',
            icon: 'Tag',
            translatable: true,
            url: '/blog/tag/{slug}',
            fields: [fields.color('color', { label: 'Color' })],
        },
    },

    admin: {
        pages: [
            defineAdminPage({
                path: 'globals',
                label: 'Globals',
                icon: 'Settings',
                translatable: true,
                public: true,
                fields: [
                    fields.tabs({
                        fields: [
                            fields.tab('general', {
                                label: 'General',
                                fields: [
                                    fields.section('brand', {
                                        label: 'Brand',
                                        fields: [
                                            fields.text('siteName', {
                                                label: 'Site Name',
                                            }),
                                            fields.text('tagline', { label: 'Tagline' }),
                                            fields.media('logo', {
                                                label: 'Logo',
                                                translatable: false,
                                            }),
                                        ],
                                    }),
                                    fields.section('footer', {
                                        label: 'Footer',
                                        fields: [
                                            fields.textarea('footerText', {
                                                label: 'Footer Text',
                                            }),
                                            fields.text('copyright', {
                                                label: 'Copyright',
                                                translatable: false,
                                            }),
                                        ],
                                    }),
                                ],
                            }),
                            fields.tab('navigation', {
                                label: 'Navigation',
                                fields: [
                                    fields.section('social', {
                                        label: 'Social',
                                        fields: [
                                            fields.repeater('socials', {
                                                label: 'Social Links',
                                                fields: [
                                                    fields.text('platform', {
                                                        label: 'Platform',
                                                    }),
                                                    fields.url('url', {
                                                        label: 'URL',
                                                        translatable: false,
                                                    }),
                                                ],
                                            }),
                                        ],
                                    }),
                                ],
                            }),
                        ],
                    }),
                ],
            }),
            defineAdminPage({
                path: 'site-status',
                label: 'Site Status',
                icon: 'Activity',
                component: './src/admin/pages/site-status.tsx',
            }),
        ],
    },

    media: {
        fields: [
            fields.text('photographer'),
            fields.text('copyright'),
            fields.text('alt_text'),
        ],
    },

    users: {
        fields: [
            fields.textarea('bio'),
            fields.relationship('avatar', { target: 'media' }),
        ],
    },
});
