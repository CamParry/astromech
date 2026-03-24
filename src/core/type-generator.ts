/**
 * SDK Type Generator
 *
 * Generates a .d.ts file from the resolved Astromech config so that
 * `Astromech.collections.posts.get()` returns a typed entity specific
 * to the `posts` collection.
 */

import type { FieldDefinition, FieldGroup, ResolvedConfig } from '@/types/index.js';

// ============================================================================
// Naming Helpers
// ============================================================================

/**
 * Convert a collection slug (snake_case, kebab-case, camelCase) to PascalCase.
 * e.g. "blog_posts" → "BlogPosts", "my-collection" → "MyCollection"
 */
function toPascalCase(name: string): string {
    return name
        .replace(/[-_](.)/g, (_, char: string) => char.toUpperCase())
        .replace(/^(.)/, (_, char: string) => char.toUpperCase());
}

// ============================================================================
// Field Type Mapping
// ============================================================================

/**
 * Visual container field types — they have no stored value and are skipped.
 */
const CONTAINER_TYPES = new Set(['group', 'accordion', 'tab']);

/**
 * Field types that produce a relation (populate-able) value.
 */
const RELATION_TYPES = new Set(['relationship', 'media']);

/**
 * Map a FieldDefinition to its TypeScript type string for the Fields interface.
 * Returns null for unknown or container types (caller should skip them).
 */
function fieldToTsType(field: FieldDefinition): string | null {
    if (CONTAINER_TYPES.has(field.type)) return null;

    switch (field.type) {
        case 'text':
        case 'textarea':
        case 'richtext':
        case 'email':
        case 'url':
        case 'slug':
        case 'color':
            return 'string';

        case 'number':
        case 'range':
            return 'number';

        case 'boolean':
            return 'boolean';

        case 'date':
        case 'datetime':
            return 'string';

        case 'select':
        case 'radio-group':
            return 'string';

        case 'multiselect':
        case 'checkbox-group':
            return 'string[]';

        case 'media':
            // Unpopulated: stores ID string(s)
            return field.multiple === true ? 'string[]' : 'string';

        case 'relationship':
            // Unpopulated: stores ID string(s)
            return field.multiple === true ? 'string[]' : 'string';

        case 'json':
            return "import('astromech').JsonValue";

        case 'repeater':
            return "import('astromech').JsonValue[]";

        case 'link':
            return '{ url: string; label: string; target?: string }';

        case 'key-value':
            return 'Record<string, string>';

        default:
            return null;
    }
}

/**
 * Map a FieldDefinition to its populated TypeScript type string for the Relations type.
 * Returns null if the field is not a relation/media field.
 */
function fieldToRelationType(
    field: FieldDefinition,
    knownCollections: Set<string>
): string | null {
    if (!RELATION_TYPES.has(field.type)) return null;

    const isMultiple = field.multiple === true;

    if (field.type === 'media') {
        const single = "import('astromech').Media";
        return isMultiple ? `${single}[]` : single;
    }

    // field.type === 'relationship'
    if (!field.target) return null;

    let single: string;
    if (field.target === 'users') {
        single = "import('astromech').User";
    } else if (field.target === 'media') {
        single = "import('astromech').Media";
    } else if (knownCollections.has(field.target)) {
        const pascal = toPascalCase(field.target);
        single = `import('astromech').TypedEntity<${pascal}Fields>`;
    } else {
        single = "import('astromech').Entity";
    }

    return isMultiple ? `${single}[]` : single;
}

// ============================================================================
// Per-Collection Generation
// ============================================================================

type CollectionTypeBlock = {
    collectionKey: string;
    fieldsInterface: string;
    relationsType: string;
};

function generateCollectionTypes(
    collectionKey: string,
    fieldGroups: FieldGroup[],
    knownCollections: Set<string>
): CollectionTypeBlock {
    const pascal = toPascalCase(collectionKey);
    const fieldsName = `${pascal}Fields`;
    const relationsName = `${pascal}Relations`;

    // Flatten all fields from all groups, recursing into container types
    const allFields: FieldDefinition[] = [];

    function collectFields(fields: FieldDefinition[], prefix: string): void {
        for (const field of fields) {
            if (CONTAINER_TYPES.has(field.type)) {
                // Recurse into container children with a prefixed name
                if (field.fields && field.fields.length > 0) {
                    collectFields(
                        field.fields.map((child) => ({ ...child, name: `${prefix}${field.name}_${child.name}` })),
                        ''
                    );
                }
            } else {
                allFields.push(prefix ? { ...field, name: `${prefix}${field.name}` } : field);
            }
        }
    }

    for (const group of fieldGroups) {
        collectFields(group.fields, '');
    }

    // Build Fields interface lines
    const fieldLines: string[] = [];
    for (const field of allFields) {
        const tsType = fieldToTsType(field);
        if (tsType === null) continue;
        const optional = field.required === true ? '' : '?';
        fieldLines.push(`  ${field.name}${optional}: ${tsType};`);
    }

    const fieldsInterface =
        fieldLines.length > 0
            ? `export interface ${fieldsName} {\n${fieldLines.join('\n')}\n}`
            : `export interface ${fieldsName} {}`;

    // Build Relations type (only populate-able fields)
    const relationLines: string[] = [];
    for (const field of allFields) {
        const relType = fieldToRelationType(field, knownCollections);
        if (relType === null) continue;
        relationLines.push(`  ${field.name}: ${relType};`);
    }

    const relationsType =
        relationLines.length > 0
            ? `export type ${relationsName} = {\n${relationLines.join('\n')}\n};`
            : `export type ${relationsName} = Record<string, never>;`;

    return { collectionKey, fieldsInterface, relationsType };
}

// ============================================================================
// Main Export
// ============================================================================

/**
 * Generate the full content of the `.astro/astromech.d.ts` type declaration file.
 */
export function generateSdkTypes(config: ResolvedConfig): string {
    const collectionKeys = Object.keys(config.collections);
    const knownCollections = new Set(collectionKeys);

    const blocks = collectionKeys.map((key) =>
        generateCollectionTypes(key, config.collections[key]!.fieldGroups, knownCollections)
    );

    const augmentationLines = blocks
        .map(({ collectionKey }) => {
            const pascal = toPascalCase(collectionKey);
            return `    ${collectionKey}: { fields: ${pascal}Fields; relations: ${pascal}Relations };`;
        })
        .join('\n');

    const collectionTypeBlocks = blocks
        .map(({ collectionKey, fieldsInterface, relationsType }) => {
            const pascal = toPascalCase(collectionKey);
            return [
                `// --- Collection: ${collectionKey} (${pascal}) ---`,
                '',
                fieldsInterface,
                '',
                relationsType,
            ].join('\n');
        })
        .join('\n\n');

    return [
        '// Auto-generated by Astromech. Do not edit.',
        '',
        "declare module 'astromech' {",
        '  interface AstromechCollections {',
        augmentationLines,
        '  }',
        '}',
        '',
        collectionTypeBlocks,
        '',
        'export {};',
        '',
    ].join('\n');
}
