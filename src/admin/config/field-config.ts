/**
 * Centralized field configuration and constants
 * Single source of truth for field-related constants and utilities
 */

/**
 * Fields stored at entry level (not in fields JSON)
 */
export const ENTRY_LEVEL_FIELDS = [
    'status',
    'publishedAt',
    'title',
    'slug',
    'createdAt',
    'updatedAt',
] as const;

/**
 * Auto-managed fields (read-only)
 */
export const READ_ONLY_FIELDS = ['createdAt', 'updatedAt'] as const;

/**
 * Map field types to component names
 */
export const FIELD_COMPONENTS = {
    text: 'TextField',
    textarea: 'TextareaField',
    richtext: 'RichtextField',
    number: 'NumberField',
    boolean: 'BooleanField',
    date: 'DateField',
    datetime: 'DatetimeField',
    select: 'SelectField',
    multiselect: 'MultiselectField',
    media: 'MediaField',
    relationship: 'RelationshipField',
    repeater: 'RepeaterField',
    blocks: 'BlocksField',
    email: 'EmailField',
    url: 'UrlField',
    color: 'ColorField',
    slug: 'SlugField',
} as const;

/**
 * Field types that are implemented
 */
export const IMPLEMENTED_TYPES = Object.keys(FIELD_COMPONENTS);

/**
 * Check if field is entry-level
 */
export function isEntryField(fieldName: string): boolean {
    return (ENTRY_LEVEL_FIELDS as readonly string[]).includes(fieldName);
}

/**
 * Check if field is read-only
 */
export function isReadOnlyField(fieldName: string): boolean {
    return (READ_ONLY_FIELDS as readonly string[]).includes(fieldName);
}

/**
 * Get input name for form submission
 */
export function getInputName(fieldName: string): string {
    return isEntryField(fieldName) ? fieldName : `fields.${fieldName}`;
}
