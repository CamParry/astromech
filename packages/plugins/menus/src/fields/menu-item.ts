import * as fields from 'astromech/fields';

/** The node schema used at every depth of the menu item tree. */
export const menuItemFields = [
    fields.text('label', { label: 'Label', translatable: true }),
    fields.relationship('entry', { label: 'Entry (internal link)' }),
    fields.url('url', { label: 'URL (external link)', translatable: true }),
    fields.boolean('newTab', { label: 'Open in new tab' }),
];
