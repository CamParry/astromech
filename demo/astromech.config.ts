import { fileURLToPath } from 'node:url';
import { builtInRole, defineConfig, FilesystemStorage, libsqlDriver } from 'astromech';
import * as fields from 'astromech/fields';
import { redirects, redirectsPermissions } from 'astromech/plugins/redirects';
import { seo, seoSection, seoPermissions } from 'astromech/plugins/seo';
import { rating } from './src/plugins/rating/index.js';

export default defineConfig({
    db: libsqlDriver({
        url: 'file:' + fileURLToPath(new URL('./database.db', import.meta.url)),
    }),
    storage: new FilesystemStorage({ dir: './public/uploads' }),
    locales: ['en', 'fr'],
    defaultLocale: 'en',
    plugins: [redirects(), seo(), rating()],
    roles: {
        'content-editor': {
            name: 'Content Editor',
            permissions: [
                ...builtInRole('editor'),
                ...seoPermissions('view'),
                ...redirectsPermissions('manage'),
            ],
        },
    },
    entries: {
        page: {
            single: 'Page',
            plural: 'Pages',
            translatable: true,
            versioning: true,
            fields: {
                main: [
                    fields.repeater('sections', {
                        label: 'Page Sections',
                        fields: [
                            fields.text('title', { label: 'Title' }),
                            fields.richtext('content', { label: 'Content' }),
                            fields.select('layout', {
                                label: 'Layout',
                                options: ['full-width', 'two-column', 'three-column'],
                            }),
                        ],
                    }),
                    fields.tabs({
                        fields: [
                            fields.tab('seo', { label: 'SEO', fields: [seoSection()] }),
                            fields.tab('social-sharing', {
                                fields: [
                                    fields.text('ogTitle', { label: 'Open Graph Title' }),
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
                sidebar: [
                    fields.section('metadata', {
                        fields: [
                            fields.relationship('author', {
                                label: 'Author',
                                target: 'users',
                            }),
                            fields.relationship('parent_pages', {
                                label: 'Parent Page',
                                target: 'page',
                            }),
                            fields.relationship('category', {
                                label: 'Category',
                                target: 'category',
                                multiple: true,
                            }),
                            fields.multiselect('tags', {
                                label: 'Tags',
                                options: [
                                    'Featured',
                                    'Popular',
                                    'New',
                                    'Updated',
                                    'Archived',
                                ],
                            }),
                        ],
                    }),
                    fields.section('page-settings', {
                        fields: [
                            fields.select('template', {
                                label: 'Template',
                                translatable: false,
                                options: ['default', 'landing', 'full-width', 'sidebar'],
                            }),
                            fields.color('theme_color', {
                                label: 'Theme Color',
                                translatable: false,
                            }),
                            fields.textarea('custom_css', { label: 'Custom CSS' }),
                            fields.media('og_image', { label: 'Open Graph Image' }),
                            fields.boolean('noindex', {
                                label: 'No Index',
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
            versioning: true,
            translatable: true,
            views: ['list', 'grid'],
            defaultView: 'list',
            gridFields: [{ field: 'excerpt', label: 'Excerpt' }],
            fields: {
                main: [
                    fields.richtext('body', { required: true }),
                    fields.textarea('excerpt'),
                    seoSection(),
                ],
                sidebar: [
                    fields.section('taxonomy', {
                        fields: [
                            fields.media('featured_image', {
                                label: 'Featured Image',
                                translatable: false,
                            }),
                            fields.relationship('category', {
                                target: 'category',
                                inverse: 'post',
                            }),
                            fields.relationship('tags', {
                                target: 'tag',
                                multiple: true,
                                inverse: 'post',
                            }),
                            fields.relationship('author', {
                                target: 'users',
                                inverse: 'post',
                            }),
                        ],
                    }),
                ],
            },
        },
        category: {
            single: 'Category',
            plural: 'Categories',
            fields: [fields.textarea('description')],
        },
        tag: {
            single: 'Tag',
            plural: 'Tags',
            fields: [fields.text('color')],
        },
        showcase: {
            single: 'Showcase',
            plural: 'Showcase',
            fields: {
                main: [
                    fields.section('basic-fields', {
                        fields: [
                            fields.textarea('summary', { label: 'Summary' }),
                            fields.range('score', {
                                label: 'Score',
                                min: 0,
                                max: 100,
                                step: 5,
                            }),
                            fields.number('rating', { label: 'Rating', min: 1, max: 5 }),
                            fields.date('published_date', { label: 'Published Date' }),
                            fields.boolean('active', { label: 'Active' }),
                            fields.color('color_theme', { label: 'Color Theme' }),
                            fields.url('website', { label: 'Website' }),
                            fields.email('contact_email', { label: 'Contact Email' }),
                        ],
                    }),
                    fields.section('choice-fields', {
                        fields: [
                            fields.select('status_select', {
                                label: 'Status',
                                options: ['active', 'inactive', 'pending', 'archived'],
                            }),
                            fields.checkboxGroup('features', {
                                label: 'Features',
                                options: [
                                    'Dark Mode',
                                    'Notifications',
                                    'Analytics',
                                    'API Access',
                                    'SSO',
                                ],
                            }),
                            fields.radioGroup('priority', {
                                label: 'Priority',
                                options: ['low', 'medium', 'high', 'critical'],
                            }),
                            fields.multiselect('tags', {
                                label: 'Tags',
                                options: [
                                    'frontend',
                                    'backend',
                                    'design',
                                    'devops',
                                    'mobile',
                                ],
                            }),
                        ],
                    }),
                    fields.section('structured-fields', {
                        fields: [
                            fields.link('cta_link', { label: 'CTA Link' }),
                            fields.keyValue('metadata', { label: 'Metadata' }),
                            fields.json('config', { label: 'Config JSON' }),
                        ],
                    }),
                    fields.section('layout-fields', {
                        fields: [
                            fields.accordion('advanced-settings', {
                                collapsed: true,
                                fields: [
                                    fields.number('cache_ttl', {
                                        label: 'Cache TTL (seconds)',
                                    }),
                                    fields.text('robots', { label: 'Robots Directive' }),
                                ],
                            }),
                            fields.tabs({
                                fields: [
                                    fields.tab('english', {
                                        fields: [
                                            fields.textarea('en_content', {
                                                label: 'English Content',
                                            }),
                                        ],
                                    }),
                                    fields.tab('french', {
                                        fields: [
                                            fields.textarea('fr_content', {
                                                label: 'French Content',
                                            }),
                                        ],
                                    }),
                                    fields.tab('spanish', {
                                        fields: [
                                            fields.textarea('es_content', {
                                                label: 'Spanish Content',
                                            }),
                                        ],
                                    }),
                                ],
                            }),
                        ],
                    }),
                ],
                sidebar: [
                    fields.section('media-relations', {
                        label: 'Media & Relations',
                        fields: [
                            fields.media('hero_image', { label: 'Hero Image' }),
                            fields.media('gallery', { label: 'Gallery', multiple: true }),
                            fields.relationship('related_posts', {
                                target: 'post',
                                multiple: true,
                                label: 'Related Posts',
                            }),
                        ],
                    }),
                ],
            },
        },
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
