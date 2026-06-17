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
 *
 * When `shape === 'public'`, fields marked `private: true` are excluded.
 */
function collectDataFields(
    fields: FieldDefinition[],
    shape: 'full' | 'public' = 'full'
): FieldDefinition[] {
    const result: FieldDefinition[] = [];
    for (const field of fields) {
        if (LAYOUT_TYPES.has(field.type)) {
            // Flatten layout container children at the same level.
            result.push(...collectDataFields(field.fields ?? [], shape));
        } else {
            if (shape === 'public' && field.private === true) continue;
            result.push(field);
        }
    }
    return result;
}

/**
 * Build the body lines of an object type from a FieldDefinition[].
 * Used for top-level collections and recursively for group/repeater children.
 * Each line is indented by `indent` spaces.
 *
 * `hoisted` — optional accumulator for top-level interface declarations that
 * cannot be expressed inline (e.g. self-referential tree node types).
 */
function buildObjectLines(
    fields: FieldDefinition[],
    pluginFieldTypes: Map<string, PluginFieldTypeRegistration>,
    indent: string,
    hoisted?: string[],
    shape: 'full' | 'public' = 'full'
): string[] {
    const dataFields = collectDataFields(fields, shape);
    const lines: string[] = [];
    for (const field of dataFields) {
        const tsType = fieldToTsType(field, pluginFieldTypes, hoisted, shape);
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
 *
 * `hoisted` — optional accumulator; tree fields push a named interface here so
 * the self-referential node type terminates without infinite inlining.
 *
 * `shape` — 'full' emits all instance keys; 'public' omits `_disabled`/`_title`
 * from block/repeater/tree element types and skips `private` child fields.
 */
function fieldToTsType(
    field: FieldDefinition,
    pluginFieldTypes: Map<string, PluginFieldTypeRegistration>,
    hoisted?: string[],
    shape: 'full' | 'public' = 'full'
): string | null {
    // Layout containers are flattened by collectDataFields before we reach here.
    if (LAYOUT_TYPES.has(field.type)) return null;

    const pluginType = pluginFieldTypes.get(field.type);
    if (pluginType) {
        // No typeGen → JsonValue. A typeGen returning null opts out entirely
        // (presentational field, no stored data) and is skipped by the caller.
        if (pluginType.typeGen === undefined) return "import('astromech').JsonValue";
        return pluginType.typeGen(field);
    }

    switch (field.type) {
        case 'text':
        case 'textarea':
        case 'email':
        case 'url':
        case 'slug':
        case 'color':
            return 'string';

        // richtext: full shape stores ProseMirror JSON; public shape is rendered HTML string.
        case 'richtext':
            return shape === 'public' ? 'string' : "import('astromech').JsonValue";

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
                '  ',
                hoisted,
                shape
            );
            if (childLines.length === 0) return '{}';
            return `{\n${childLines.join('\n')}\n}`;
        }

        case 'repeater': {
            // Typed array of the child object shape. `_id` is a persisted UUID
            // (stable item identity for diffs/versioning).
            const childLines = buildObjectLines(
                field.fields ?? [],
                pluginFieldTypes,
                '  ',
                hoisted,
                shape
            );
            const lines =
                shape === 'public'
                    ? ['  _id: string;', ...childLines]
                    : [
                          '  _id: string;',
                          '  _disabled?: boolean;',
                          '  _title?: string;',
                          ...childLines,
                      ];
            return `Array<{\n${lines.join('\n')}\n}>`;
        }

        case 'tree': {
            // Self-referential node type — must be a named interface so the
            // recursion terminates. Push the interface to the hoisted accumulator
            // and return a reference to it as an array.
            const suffix = shape === 'public' ? 'PublicTreeNode' : 'TreeNode';
            const nodeName = `${toPascalCase(field.name)}${suffix}`;
            const childLines = buildObjectLines(
                field.fields ?? [],
                pluginFieldTypes,
                '  ',
                hoisted,
                shape
            );
            const lines =
                shape === 'public'
                    ? ['  _id: string;', ...childLines, `  _children?: ${nodeName}[];`]
                    : [
                          '  _id: string;',
                          '  _disabled?: boolean;',
                          ...childLines,
                          `  _children?: ${nodeName}[];`,
                      ];
            const iface = `export interface ${nodeName} {\n${lines.join('\n')}\n}`;
            if (hoisted !== undefined) {
                hoisted.push(iface);
            }
            return `${nodeName}[]`;
        }

        case 'blocks':
            if (shape === 'public') {
                return "Array<{ _id: string; _type: string; [key: string]: import('astromech').JsonValue | undefined }>";
            }
            return "Array<{ _id: string; _type: string; _disabled?: boolean; _title?: string; [key: string]: import('astromech').JsonValue | undefined }>";

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
 * `shape` — 'public' references `…FieldsPublic`; 'full' references `…Fields`.
 */
function fieldToRelationType(
    field: FieldDefinition,
    knownCollections: Set<string>,
    qualifiedTargetMap: Map<string, string> = new Map<string, string>(),
    shape: 'full' | 'public' = 'full'
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
        const fieldsName =
            shape === 'public' ? `${pascal}FieldsPublic` : `${pascal}Fields`;
        single = `import('astromech').TypedEntry<${fieldsName}>`;
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
    fieldsPublicInterface: string;
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
    const fieldsPublicName = `${pascal}FieldsPublic`;
    const relationsName = `${pascal}Relations`;

    // Collect all data-bearing fields from both columns, layout containers flattened.
    const allFields = collectDataFields([...fields.main, ...fields.sidebar]);
    const allFieldsPublic = collectDataFields(
        [...fields.main, ...fields.sidebar],
        'public'
    );

    // Accumulator for top-level declarations hoisted by nested field types (e.g. tree
    // node interfaces that must be named to allow self-reference).
    const hoisted: string[] = [];
    const hoistedPublic: string[] = [];

    // Build full Fields interface lines
    const fieldLines: string[] = [];
    for (const field of allFields) {
        const tsType = fieldToTsType(field, pluginFieldTypes, hoisted, 'full');
        if (tsType === null) continue;
        const optional = field.required === true ? '' : '?';
        fieldLines.push(`  ${propertyKey(field.name)}${optional}: ${tsType};`);
    }

    const mainInterface =
        fieldLines.length > 0
            ? `export interface ${fieldsName} {\n${fieldLines.join('\n')}\n}`
            : `export interface ${fieldsName} {}`;

    // Hoist any extra declarations (tree node interfaces) before the Fields interface.
    const fieldsInterface =
        hoisted.length > 0
            ? `${hoisted.join('\n\n')}\n\n${mainInterface}`
            : mainInterface;

    // Build public FieldsPublic interface lines
    const fieldPublicLines: string[] = [];
    for (const field of allFieldsPublic) {
        const tsType = fieldToTsType(field, pluginFieldTypes, hoistedPublic, 'public');
        if (tsType === null) continue;
        const optional = field.required === true ? '' : '?';
        fieldPublicLines.push(`  ${propertyKey(field.name)}${optional}: ${tsType};`);
    }

    // Always add the __shape brand marker for public types.
    const publicBodyLines = ["  readonly __shape?: 'public';", ...fieldPublicLines];
    const mainPublicInterface = `export interface ${fieldsPublicName} {\n${publicBodyLines.join('\n')}\n}`;

    const fieldsPublicInterface =
        hoistedPublic.length > 0
            ? `${hoistedPublic.join('\n\n')}\n\n${mainPublicInterface}`
            : mainPublicInterface;

    // Build Relations type (only populate-able fields from flat top-level data fields)
    const relationLines: string[] = [];
    for (const field of allFields) {
        const relType = fieldToRelationType(
            field,
            knownCollections,
            qualifiedTargetMap,
            'full'
        );
        if (relType === null) continue;
        relationLines.push(`  ${propertyKey(field.name)}: ${relType};`);
    }

    const relationsType =
        relationLines.length > 0
            ? `export type ${relationsName} = {\n${relationLines.join('\n')}\n};`
            : `export type ${relationsName} = Record<string, never>;`;

    return { collectionKey, fieldsInterface, fieldsPublicInterface, relationsType };
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
    fieldsPublicInterface: string;
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
                fieldsPublicInterface: block.fieldsPublicInterface,
                relationsType: block.relationsType,
            });

            // Register qualified target so other fields can reference it.
            // For full shape, map to the full Fields interface.
            // For public shape, callers use the public variant directly.
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
                `      ${typeKey}: { fields: ${prefix}Fields; fieldsPublic: ${prefix}FieldsPublic; relations: ${prefix}Relations };`
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
            return `    ${collectionKey}: { fields: ${pascal}Fields; fieldsPublic: ${pascal}FieldsPublic; relations: ${pascal}Relations };`;
        })
        .join('\n');

    const collectionTypeBlocks = blocks
        .map(
            ({
                collectionKey,
                fieldsInterface,
                fieldsPublicInterface,
                relationsType,
            }) => {
                const pascal = toPascalCase(collectionKey);
                return [
                    `// --- Collection: ${collectionKey} (${pascal}) ---`,
                    '',
                    fieldsInterface,
                    '',
                    fieldsPublicInterface,
                    '',
                    relationsType,
                ].join('\n');
            }
        )
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
                block.fieldsPublicInterface,
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
