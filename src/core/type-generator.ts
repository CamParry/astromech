/**
 * SDK Type Generator
 *
 * Generates a .d.ts file from the resolved Astromech config so that
 * `Astromech.entryTypes.posts.get()` returns a typed entry specific
 * to the `posts` entry type.
 */

import type {
    FieldDefinition,
    PluginDefinition,
    PluginFieldTypeRegistration,
    ResolvedConfig,
    ResolvedEntryFields,
} from '@/types/index.js';

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
 * Layout container field types — pure chrome, no stored value. Their children
 * are flattened into the parent data level (no key nesting).
 */
const LAYOUT_TYPES = new Set(['section', 'tabs', 'tab', 'accordion']);

/**
 * Field types that produce a relation (populate-able) value.
 */
const RELATION_TYPES = new Set(['relationship', 'media']);

/** Quote property names that aren't valid TS identifiers (e.g. `seo-meta`). */
function propertyKey(name: string): string {
    return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name);
}

/**
 * Walk a FieldDefinition[] and return all data-bearing nodes, with layout
 * containers (section/tabs/tab/accordion) transparently flattened in-place.
 * Data containers (group/repeater/blocks) and leaf fields are returned as-is —
 * they each become a single property on the containing object.
 */
function collectDataFields(fields: FieldDefinition[]): FieldDefinition[] {
    const result: FieldDefinition[] = [];
    for (const field of fields) {
        if (LAYOUT_TYPES.has(field.type)) {
            // Flatten layout container children at the same level.
            result.push(...collectDataFields(field.fields ?? []));
        } else {
            result.push(field);
        }
    }
    return result;
}

/**
 * Build the body lines of an object type from a FieldDefinition[].
 * Used for top-level collections and recursively for group/repeater children.
 * Each line is indented by `indent` spaces.
 */
function buildObjectLines(
    fields: FieldDefinition[],
    pluginFieldTypes: Map<string, PluginFieldTypeRegistration>,
    indent: string
): string[] {
    const dataFields = collectDataFields(fields);
    const lines: string[] = [];
    for (const field of dataFields) {
        const tsType = fieldToTsType(field, pluginFieldTypes);
        if (tsType === null) continue;
        const optional = field.required === true ? '' : '?';
        lines.push(`${indent}${propertyKey(field.name)}${optional}: ${tsType};`);
    }
    return lines;
}

/**
 * Map a FieldDefinition to its TypeScript type string for the Fields interface.
 * Plugin-registered types use their `typeGen` (default `JsonValue`). Returns
 * null for layout container types (they never appear as a field line —
 * collectDataFields flattens them away before this is called) and for
 * unrecognised types.
 */
function fieldToTsType(
    field: FieldDefinition,
    pluginFieldTypes: Map<string, PluginFieldTypeRegistration>
): string | null {
    // Layout containers are flattened by collectDataFields before we reach here.
    if (LAYOUT_TYPES.has(field.type)) return null;

    const pluginType = pluginFieldTypes.get(field.type);
    if (pluginType) {
        return pluginType.typeGen?.(field) ?? "import('astromech').JsonValue";
    }

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

        case 'group': {
            // Nested object: children are recursively typed.
            // Layout containers within the children are flattened.
            const childLines = buildObjectLines(
                field.fields ?? [],
                pluginFieldTypes,
                '  '
            );
            if (childLines.length === 0) return '{}';
            return `{\n${childLines.join('\n')}\n}`;
        }

        case 'repeater': {
            // Typed array of the child object shape.
            const childLines = buildObjectLines(
                field.fields ?? [],
                pluginFieldTypes,
                '  '
            );
            if (childLines.length === 0) return 'Array<Record<string, never>>';
            return `Array<{\n${childLines.join('\n')}\n}>`;
        }

        case 'blocks':
            return "Array<{ type: string; disabled?: boolean; [key: string]: import('astromech').JsonValue | undefined }>";

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
 *
 * `knownCollections` — bare root collection keys.
 * `qualifiedTargetMap` — qualified target ids (`plugin/type`) → Fields interface name.
 */
function fieldToRelationType(
    field: FieldDefinition,
    knownCollections: Set<string>,
    qualifiedTargetMap: Map<string, string> = new Map<string, string>()
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
    } else if (qualifiedTargetMap.has(field.target)) {
        // Qualified target: `plugin/type` → resolved plugin Fields interface
        const fieldsName = qualifiedTargetMap.get(field.target) ?? 'never';
        single = `import('astromech').TypedEntry<${fieldsName}>`;
    } else if (knownCollections.has(field.target)) {
        const pascal = toPascalCase(field.target);
        single = `import('astromech').TypedEntry<${pascal}Fields>`;
    } else {
        single = "import('astromech').Entry";
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
    fields: ResolvedEntryFields,
    knownCollections: Set<string>,
    pluginFieldTypes: Map<string, PluginFieldTypeRegistration>,
    qualifiedTargetMap: Map<string, string> = new Map<string, string>()
): CollectionTypeBlock {
    const pascal = toPascalCase(collectionKey);
    const fieldsName = `${pascal}Fields`;
    const relationsName = `${pascal}Relations`;

    // Collect all data-bearing fields from both columns, layout containers flattened.
    const allFields = collectDataFields([...fields.main, ...fields.sidebar]);

    // Build Fields interface lines
    const fieldLines: string[] = [];
    for (const field of allFields) {
        const tsType = fieldToTsType(field, pluginFieldTypes);
        if (tsType === null) continue;
        const optional = field.required === true ? '' : '?';
        fieldLines.push(`  ${propertyKey(field.name)}${optional}: ${tsType};`);
    }

    const fieldsInterface =
        fieldLines.length > 0
            ? `export interface ${fieldsName} {\n${fieldLines.join('\n')}\n}`
            : `export interface ${fieldsName} {}`;

    // Build Relations type (only populate-able fields from flat top-level data fields)
    const relationLines: string[] = [];
    for (const field of allFields) {
        const relType = fieldToRelationType(field, knownCollections, qualifiedTargetMap);
        if (relType === null) continue;
        relationLines.push(`  ${propertyKey(field.name)}: ${relType};`);
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

/** Derive the interface-name prefix for a plugin entry type. */
function pluginEntryPrefix(pluginName: string, typeName: string): string {
    return `Plugin${toPascalCase(pluginName)}${toPascalCase(typeName)}`;
}

type PluginEntryBlock = {
    pluginName: string;
    typeName: string;
    fieldsInterface: string;
    relationsType: string;
};

/**
 * Generate per-plugin entry type interfaces and the `AstromechPluginEntryTypes`
 * augmentation block. Returns an empty array when there are no plugin entries.
 */
function generatePluginEntryBlocks(
    pluginEntries: Record<string, Record<string, { fields: ResolvedEntryFields }>>,
    knownCollections: Set<string>,
    qualifiedTargetMap: Map<string, string>,
    pluginFieldTypes: Map<string, PluginFieldTypeRegistration>
): PluginEntryBlock[] {
    const blocks: PluginEntryBlock[] = [];

    for (const [pluginName, types] of Object.entries(pluginEntries)) {
        for (const [typeName, entryType] of Object.entries(types)) {
            const prefix = pluginEntryPrefix(pluginName, typeName);

            // Reuse collection codegen with plugin-prefixed interface names.
            // collectionKey === prefix → pascal === prefix (already PascalCase),
            // so the generated names are `${prefix}Fields` / `${prefix}Relations`.
            const block = generateCollectionTypes(
                prefix,
                entryType.fields,
                knownCollections,
                pluginFieldTypes,
                qualifiedTargetMap
            );

            blocks.push({
                pluginName,
                typeName,
                fieldsInterface: block.fieldsInterface,
                relationsType: block.relationsType,
            });

            // Register qualified target so other fields can reference it
            qualifiedTargetMap.set(`${pluginName}/${typeName}`, `${prefix}Fields`);
        }
    }

    return blocks;
}

/**
 * `declare module` augmentation for installed plugins: declared `hookEvents`
 * on `AstromechPluginHookEvents`, and per-plugin entry types on
 * `AstromechPluginEntryTypes`. SDK method signatures are no longer emitted
 * here — plugins self-augment `AstromechPluginSdks` in their own `.d.ts`.
 */
function generatePluginAugmentations(
    plugins: PluginDefinition[],
    pluginEntryBlocks: PluginEntryBlock[]
): string[] {
    const eventLines = plugins.flatMap((def) =>
        (def.hookEvents ?? []).map((event) => `    '${event}': unknown;`)
    );

    // Group plugin entry blocks by plugin name for the augmentation
    const entryAugLines: string[] = [];
    const byPlugin = new Map<string, PluginEntryBlock[]>();
    for (const block of pluginEntryBlocks) {
        const arr = byPlugin.get(block.pluginName) ?? [];
        arr.push(block);
        byPlugin.set(block.pluginName, arr);
    }
    for (const [pluginName, blocks] of byPlugin) {
        const key = propertyKey(pluginName);
        entryAugLines.push(`    ${key}: {`);
        for (const block of blocks) {
            const prefix = pluginEntryPrefix(block.pluginName, block.typeName);
            const typeKey = propertyKey(block.typeName);
            entryAugLines.push(
                `      ${typeKey}: { fields: ${prefix}Fields; relations: ${prefix}Relations };`
            );
        }
        entryAugLines.push('    };');
    }

    if (eventLines.length === 0 && entryAugLines.length === 0) {
        return [];
    }

    return [
        '',
        '// --- Installed plugins ---',
        '',
        "declare module 'astromech' {",
        '  interface AstromechPluginHookEvents {',
        ...eventLines,
        '  }',
        '  interface AstromechPluginEntryTypes {',
        ...entryAugLines,
        '  }',
        '}',
    ];
}

export function generateSdkTypes(
    config: ResolvedConfig,
    pluginFieldTypes = new Map<string, PluginFieldTypeRegistration>(),
    plugins: PluginDefinition[] = []
): string {
    const collectionKeys = Object.keys(config.entries);
    const knownCollections = new Set(collectionKeys);

    // Build a qualified-target map so root collection relation fields can
    // reference plugin entry types (e.g. target: 'redirects/redirect').
    // Pre-populate with all plugin entry keys so forward references work.
    const qualifiedTargetMap = new Map<string, string>();
    const pluginEntriesInput = config.pluginEntries ?? {};
    for (const [pluginName, types] of Object.entries(pluginEntriesInput)) {
        for (const typeName of Object.keys(types)) {
            qualifiedTargetMap.set(
                `${pluginName}/${typeName}`,
                `${pluginEntryPrefix(pluginName, typeName)}Fields`
            );
        }
    }

    const blocks = Object.entries(config.entries).map(([key, entryType]) =>
        generateCollectionTypes(
            key,
            entryType.fields,
            knownCollections,
            pluginFieldTypes,
            qualifiedTargetMap
        )
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

    // Generate plugin entry type blocks
    const pluginEntryBlocks = generatePluginEntryBlocks(
        pluginEntriesInput,
        knownCollections,
        qualifiedTargetMap,
        pluginFieldTypes
    );

    const pluginEntryTypeBlocks = pluginEntryBlocks
        .map((block) => {
            const prefix = pluginEntryPrefix(block.pluginName, block.typeName);
            return [
                `// --- Plugin entry: ${block.pluginName}/${block.typeName} (${prefix}) ---`,
                '',
                block.fieldsInterface,
                '',
                block.relationsType,
            ].join('\n');
        })
        .join('\n\n');

    const parts: string[] = [
        '// Auto-generated by Astromech. Do not edit.',
        '',
        "declare module 'astromech' {",
        '  interface AstromechEntryTypes {',
        augmentationLines,
        '  }',
        '}',
        '',
        collectionTypeBlocks,
    ];

    if (pluginEntryTypeBlocks) {
        parts.push('', pluginEntryTypeBlocks);
    }

    parts.push(
        ...generatePluginAugmentations(plugins, pluginEntryBlocks),
        '',
        'export {};',
        ''
    );

    return parts.join('\n');
}
