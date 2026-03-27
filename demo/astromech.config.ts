import { defineConfig, FilesystemStorage, libsqlDriver } from 'astromech';

export default defineConfig({
    db: libsqlDriver({ url: 'file:./database.db' }),
    storage: new FilesystemStorage({ dir: './public/uploads' }),
    locales: ['en', 'fr'],
    defaultLocale: 'en',
    entries: {
        page: {
            single: 'Page',
            plural: 'Pages',
            translatable: true,
            versioning: true,
            fieldGroups: [
                {
                    name: 'content',
                    label: 'Content',
                    location: 'main',
                    priority: 0,
                    fields: [
                        {
                            name: 'sections',
                            type: 'repeater',
                            label: 'Page Sections',
                            fields: [
                                {
                                    name: 'title',
                                    type: 'text',
                                    label: 'Title',
                                },
                                {
                                    name: 'content',
                                    type: 'richtext',
                                    label: 'Content',
                                },
                                {
                                    name: 'layout',
                                    type: 'select',
                                    label: 'Layout',
                                    options: [
                                        'full-width',
                                        'two-column',
                                        'three-column',
                                    ],
                                },
                            ],
                        },
                    ],
                },
                {
                    name: 'metadata',
                    label: 'Metadata',
                    location: 'sidebar',
                    priority: 0,
                    fields: [
                        {
                            name: 'author',
                            type: 'relation',
                            target: 'users',
                            label: 'Author',
                        },
                        {
                            name: 'parent_pages',
                            type: 'relation',
                            target: 'page',
                            label: 'Parent Page',
                        },
                        {
                            name: 'category',
                            type: 'relation',
                            target: 'category',
                            multiple: true,
                            label: 'Category',
                        },
                        {
                            name: 'tags',
                            type: 'multiselect',
                            label: 'Tags',
                            options: [
                                'Featured',
                                'Popular',
                                'New',
                                'Updated',
                                'Archived',
                            ],
                        },
                    ],
                },
                {
                    name: 'settings',
                    label: 'Page Settings',
                    location: 'sidebar',
                    priority: 10,
                    fields: [
                        {
                            name: 'template',
                            type: 'select',
                            label: 'Template',
                            translatable: false,
                            options: [
                                'default',
                                'landing',
                                'full-width',
                                'sidebar',
                            ],
                        },
                        {
                            name: 'theme_color',
                            type: 'color',
                            label: 'Theme Color',
                            translatable: false,
                        },
                        {
                            name: 'custom_css',
                            type: 'textarea',
                            label: 'Custom CSS',
                        },
                        {
                            name: 'og_image',
                            type: 'media',
                            label: 'Open Graph Image',
                        },
                        {
                            name: 'noindex',
                            type: 'boolean',
                            label: 'No Index',
                            translatable: false,
                            checkboxLabel:
                                'Prevent search engines from indexing this page',
                        },
                    ],
                },
            ],
        },
        post: {
            single: 'Post',
            plural: 'Posts',
            versioning: true,
            translatable: true,
            views: ['list', 'grid'],
            defaultView: 'list',
            gridFields: [{ field: 'excerpt', label: 'Excerpt' }],
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
                            name: 'featured_image',
                            type: 'media',
                            label: 'Featured Image',
                            translatable: false,
                        },
                        {
                            name: 'category',
                            type: 'relation',
                            target: 'category',
                            inverse: 'post',
                        },
                        {
                            name: 'tags',
                            type: 'relation',
                            target: 'tag',
                            multiple: true,
                            inverse: 'post',
                        },
                        {
                            name: 'author',
                            type: 'relation',
                            target: 'users',
                            inverse: 'post',
                        },
                    ],
                },
            ],
        },
        category: {
            single: 'Category',
            plural: 'Categories',
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
        tag: {
            single: 'Tag',
            plural: 'Tags',
            fieldGroups: [
                {
                    name: 'content',
                    label: 'Content',
                    location: 'main',
                    priority: 0,
                    fields: [{ name: 'color', type: 'text' }],
                },
            ],
        },
        showcase: {
            single: 'Showcase',
            plural: 'Showcase',
            fieldGroups: [
                {
                    name: 'basic',
                    label: 'Basic Fields',
                    location: 'main',
                    priority: 0,
                    fields: [
                        { name: 'summary', type: 'textarea', label: 'Summary' },
                        {
                            name: 'score',
                            type: 'range',
                            label: 'Score',
                            min: 0,
                            max: 100,
                            step: 5,
                        },
                        {
                            name: 'rating',
                            type: 'number',
                            label: 'Rating',
                            min: 1,
                            max: 5,
                        },
                        {
                            name: 'published_date',
                            type: 'date',
                            label: 'Published Date',
                        },
                        {
                            name: 'active',
                            type: 'boolean',
                            label: 'Active',
                            checkboxLabel: 'This item is active',
                        },
                        {
                            name: 'color_theme',
                            type: 'color',
                            label: 'Color Theme',
                        },
                        { name: 'website', type: 'url', label: 'Website' },
                        {
                            name: 'contact_email',
                            type: 'email',
                            label: 'Contact Email',
                        },
                    ],
                },
                {
                    name: 'choices',
                    label: 'Choice Fields',
                    location: 'main',
                    priority: 10,
                    fields: [
                        {
                            name: 'status_select',
                            type: 'select',
                            label: 'Status',
                            options: [
                                'active',
                                'inactive',
                                'pending',
                                'archived',
                            ],
                        },
                        {
                            name: 'features',
                            type: 'checkbox-group',
                            label: 'Features',
                            options: [
                                'Dark Mode',
                                'Notifications',
                                'Analytics',
                                'API Access',
                                'SSO',
                            ],
                        },
                        {
                            name: 'priority',
                            type: 'radio-group',
                            label: 'Priority',
                            options: ['low', 'medium', 'high', 'critical'],
                        },
                        {
                            name: 'tags',
                            type: 'multiselect',
                            label: 'Tags',
                            options: [
                                'frontend',
                                'backend',
                                'design',
                                'devops',
                                'mobile',
                            ],
                        },
                    ],
                },
                {
                    name: 'structured',
                    label: 'Structured Fields',
                    location: 'main',
                    priority: 20,
                    fields: [
                        { name: 'cta_link', type: 'link', label: 'CTA Link' },
                        {
                            name: 'metadata',
                            type: 'key-value',
                            label: 'Metadata',
                        },
                        {
                            name: 'config',
                            type: 'json',
                            label: 'Config JSON',
                        },
                    ],
                },
                {
                    name: 'layout_demo',
                    label: 'Layout Fields',
                    location: 'main',
                    priority: 30,
                    fields: [
                        {
                            name: 'advanced_settings',
                            type: 'accordion',
                            label: 'Advanced Settings',
                            collapsed: true,
                            fields: [
                                {
                                    name: 'cache_ttl',
                                    type: 'number',
                                    label: 'Cache TTL (seconds)',
                                },
                                {
                                    name: 'robots',
                                    type: 'text',
                                    label: 'Robots Directive',
                                },
                            ],
                        },
                        {
                            name: 'content_tabs',
                            type: 'tab',
                            label: 'Content Tabs',
                            options: ['English', 'French', 'Spanish'],
                            fields: [
                                {
                                    name: 'en_content',
                                    type: 'textarea',
                                    label: 'English Content',
                                    tab: 'English',
                                },
                                {
                                    name: 'fr_content',
                                    type: 'textarea',
                                    label: 'French Content',
                                    tab: 'French',
                                },
                                {
                                    name: 'es_content',
                                    type: 'textarea',
                                    label: 'Spanish Content',
                                    tab: 'Spanish',
                                },
                            ],
                        },
                    ],
                },
                {
                    name: 'media_relations',
                    label: 'Media & Relations',
                    location: 'sidebar',
                    priority: 0,
                    fields: [
                        {
                            name: 'hero_image',
                            type: 'media',
                            label: 'Hero Image',
                        },
                        {
                            name: 'gallery',
                            type: 'media',
                            label: 'Gallery',
                            multiple: true,
                        },
                        {
                            name: 'related_posts',
                            type: 'relation',
                            target: 'post',
                            multiple: true,
                            label: 'Related Posts',
                        },
                    ],
                },
            ],
        },
    },

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
    },
});
