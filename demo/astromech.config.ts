import { fileURLToPath } from 'node:url';
import {
    builtInRole,
    defineAdminPage,
    defineConfig,
    FilesystemStorage,
    libsqlDriver,
} from 'astromech';
import { sharp } from 'astromech/images/sharp';
import * as fields from 'astromech/fields';
import { redirects, redirectsPermissions } from 'astromech/plugins/redirects';
import { seo, seoSection, seoPermissions } from 'astromech/plugins/seo';
import { menus } from '@astromech/menus';
import { rating } from './src/plugins/rating/index.js';

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
    storage: new FilesystemStorage({ dir: './public/uploads' }),
    image: { driver: sharp() },
    locales: ['en', 'fr'],
    defaultLocale: 'en-GB',
    plugins: [
        redirects(),
        seo(),
        menus({
            menus: [
                { key: 'main', label: 'Main Navigation' },
                { key: 'footer', label: 'Footer' },
            ],
        }),
        rating(),
    ],
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
            icon: 'FileText',
            translatable: true,
            versioning: true,
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
                                target: 'author',
                                inverse: 'post',
                            }),
                        ],
                    }),
                ],
            },
        },

        author: {
            single: 'Author',
            plural: 'Authors',
            icon: 'UserRound',
            translatable: true,
            url: '/authors/{slug}',
            fields: {
                main: [
                    fields.richtext('bio', { label: 'Bio' }),
                    fields.text('role', { label: 'Role' }),
                    fields.repeater('socials', {
                        label: 'Social Links',
                        fields: [
                            fields.select('platform', {
                                label: 'Platform',
                                options: ['twitter', 'github', 'linkedin', 'website'],
                            }),
                            fields.url('url', { label: 'URL' }),
                        ],
                    }),
                ],
                sidebar: [
                    fields.media('avatar', { label: 'Avatar', translatable: false }),
                ],
            },
        },

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
