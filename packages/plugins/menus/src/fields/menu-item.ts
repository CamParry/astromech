import * as fields from 'astromech/fields';

/** The node schema used at every depth of the menu item tree. */
export const menuItemFields = [
    fields.text('label', { label: 'Label', translatable: true }),
    fields.relationship('entry', { label: 'Entry (internal link)' }),
    // `text`, not `url`: a menu item usually links to a site-relative path
    // (`/blog`), which the `url` field's absolute-URL rule refuses.
    fields.text('url', {
        label: 'URL',
        description: 'A site-relative path such as /blog, or a full URL.',
        translatable: true,
    }),
    fields.boolean('newTab', { label: 'Open in new tab' }),
];
