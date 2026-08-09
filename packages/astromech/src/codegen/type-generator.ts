/**
 * Client Type Generator
 *
 * Generates a .d.ts file from the resolved Astromech config so that
 * `Astromech.entryTypes.posts.get()` returns a typed entry specific
 * to the `posts` entry type.
 */

import type {
    Field,
    FieldType,
    PluginDefinition,
    PluginFieldTypeRegistration,
    ResolvedConfig,
    ResolvedEntryFields,
} from '@/types/index';
import { getFieldType } from '@/fields/field-type-registry';
import { RESERVED_KEY_META } from '@/fields/reserved-keys';

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
 * Layout field types — presentational, no stored value. Their children
 * are flattened into the parent data level (no key nesting).
 */
const LAYOUT_TYPES = new Set(['section', 'tabs', 'tab', 'accordion']);

/**
 * Field types that produce a relation (populate-able) value.
 */
const RELATION_TYPES = new Set(['relationship', 'media']);

/**
 * TS emission + public visibility for reserved instance keys lives in
 * `RESERVED_KEY_META` (`fields/reserved-keys.ts`) — the single source shared with
 * the runtime public-read strip. `_id`/`_type` are identity keys (present in both
 * shapes); `_disabled`/`_title` are editorial metadata (full shape only). Which
 * keys a container owns comes from its field type's `reservedKeys`.
 */

/** Reserved-key type lines a container emits for the given shape, in declared order. */
function reservedKeyLines(fieldType: FieldType, shape: 'full' | 'public'): string[] {
    const lines: string[] = [];
    for (const key of fieldType.reservedKeys ?? []) {
        const emit = RESERVED_KEY_META[key];
        if (emit === undefined) continue;
        if (shape === 'public' && !emit.inPublic) continue;
        lines.push(emit.tsLine);
    }
    return lines;
}

/** Quote property names that aren't valid TS identifiers (e.g. `seo-meta`). */
function propertyKey(name: string): string {
    return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name);
}

/**
 * Walk a Field[] and return all data-bearing nodes, with layout
 * fields (section/tabs/tab/accordion) transparently flattened in-place.
 * Nested fields (group/repeater/blocks) and leaf fields are returned as-is —
 * they each become a single property on the containing object.
 *
 * When `shape === 'public'`, fields marked `private: true` are excluded.
 */
function collectDataFields(fields: Field[], shape: 'full' | 'public' = 'full'): Field[] {
    const result: Field[] = [];
    for (const field of fields) {
        if (LAYOUT_TYPES.has(field.type)) {
            // Flatten layout field children at the same level.
            result.push(...collectDataFields(field.fields ?? [], shape));
        } else {
            if (shape === 'public' && field.private === true) continue;
            result.push(field);
        }
    }
    return result;
}

/**
 * Build the body lines of an object type from a Field[].
 * Used for top-level collections and recursively for group/repeater children.
 * Each line is indented by `indent` spaces.
 *
 * `hoisted` — optional accumulator for top-level type declarations that
 * cannot be expressed inline (e.g. self-referential tree node types).
 */
function buildObjectLines(
    fields: Field[],
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
 * Map a Field to its TypeScript type string for the Fields type.
 * Plugin-registered types use their `typeGen` (default `JsonValue`). Returns
 * null for layout field types (they never appear as a field line —
 * collectDataFields flattens them away before this is called) and for
 * unrecognised types.
 *
 * `hoisted` — optional accumulator; tree fields push a named type alias here so
 * the self-referential node type terminates without infinite inlining.
 *
 * `shape` — 'full' emits all instance keys; 'public' omits `_disabled`/`_title`
 * from block/repeater/tree element types and skips `private` child fields.
 */
function fieldToTsType(
    field: Field,
    pluginFieldTypes: Map<string, PluginFieldTypeRegistration>,
    hoisted?: string[],
    shape: 'full' | 'public' = 'full'
): string | null {
    // Layout fields are flattened by collectDataFields before we reach here.
    if (LAYOUT_TYPES.has(field.type)) return null;

    const pluginType = pluginFieldTypes.get(field.type);
    if (pluginType) {
        // No typeGen → JsonValue. A typeGen returning null opts out entirely
        // (presentational field, no stored data) and is skipped by the caller.
        if (pluginType.typeGen === undefined) return "import('astromech').JsonValue";
        return pluginType.typeGen(field);
    }

    const fieldType = getFieldType(field.type);
    if (fieldType === undefined) return null;

    // A `children` slot marks a nested field. Those need the recursion + hoisting
    // context that the field type's pure `tsType(field, shape)` signature can't
    // carry, so they're emitted here. Their reserved instance keys come from
    // `fieldType.reservedKeys`; this code owns only the recursion structure.
    if (fieldType.children !== undefined) {
        switch (field.type) {
            case 'group': {
                // Nested object: children are recursively typed.
                // Layout fields within the children are flattened.
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
                // Typed array of the child object shape, prefixed by the reserved
                // instance keys (`_id` is a persisted UUID for stable item identity).
                const childLines = buildObjectLines(
                    field.fields ?? [],
                    pluginFieldTypes,
                    '  ',
                    hoisted,
                    shape
                );
                const reserved = reservedKeyLines(fieldType, shape).map((l) => `  ${l}`);
                const lines = [...reserved, ...childLines];
                return `Array<{\n${lines.join('\n')}\n}>`;
            }

            case 'tree': {
                // Self-referential node type — must be a named declaration so the
                // recursion terminates. Push the alias to the hoisted accumulator
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
                const reserved = reservedKeyLines(fieldType, shape).map((l) => `  ${l}`);
                const lines = [
                    ...reserved,
                    ...childLines,
                    `  _children?: ${nodeName}[];`,
                ];
                const alias = `export type ${nodeName} = {\n${lines.join('\n')}\n};`;
                if (hoisted !== undefined) {
                    hoisted.push(alias);
                }
                return `${nodeName}[]`;
            }

            case 'blocks': {
                // Heterogeneous array; `_type` discriminates the block variant and
                // the intersected `JsonObject` carries arbitrary block data. The
                // intersection rather than an inline `[key: string]` index
                // signature is what keeps the element a `JsonObject`: an inline
                // signature would have to admit `undefined` to cover the optional
                // reserved keys, and `JsonValue | undefined` is not `JsonValue`.
                const reserved = reservedKeyLines(fieldType, shape);
                return `Array<import('astromech').JsonObject & { ${reserved.join(' ')} }>`;
            }
        }
    }

    return fieldType.tsType(field, shape);
}

/**
 * Map a Field to its populated TypeScript type string for the Relations type.
 * Returns null if the field is not a relation/media field.
 *
 * `knownCollections` — bare root collection keys.
 * `qualifiedTargetMap` — qualified target ids (`plugin/type`) → Fields type name.
 * `shape` — 'public' references `…FieldsPublic`; 'full' references `…Fields`.
 */
function fieldToRelationType(
    field: Field,
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
        // Qualified target: `plugin/type` → resolved plugin Fields type
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
    fieldsType: string;
    fieldsPublicType: string;
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

    // Collect all data-bearing fields from both columns, layout fields flattened.
    const allFields = collectDataFields([...fields.main, ...fields.sidebar]);
    const allFieldsPublic = collectDataFields(
        [...fields.main, ...fields.sidebar],
        'public'
    );

    // Accumulator for top-level declarations hoisted by nested field types (e.g. tree
    // node types that must be named to allow self-reference).
    const hoisted: string[] = [];
    const hoistedPublic: string[] = [];

    // Build full Fields lines
    const fieldLines: string[] = [];
    for (const field of allFields) {
        const tsType = fieldToTsType(field, pluginFieldTypes, hoisted, 'full');
        if (tsType === null) continue;
        const optional = field.required === true ? '' : '?';
        fieldLines.push(`  ${propertyKey(field.name)}${optional}: ${tsType};`);
    }

    // A type alias, not an interface: only an alias of an object type gets the
    // implicit index signature that makes it assignable to `Entry['fields']`
    // (`JsonObject`). An interface never does, so `TypedEntry<PostFields>` could
    // not be passed where an `Entry` was expected.
    const mainType =
        fieldLines.length > 0
            ? `export type ${fieldsName} = {\n${fieldLines.join('\n')}\n};`
            : `export type ${fieldsName} = {};`;

    // Hoist any extra declarations (tree node types) before the Fields type.
    const fieldsType =
        hoisted.length > 0 ? `${hoisted.join('\n\n')}\n\n${mainType}` : mainType;

    // Build public FieldsPublic lines
    const fieldPublicLines: string[] = [];
    for (const field of allFieldsPublic) {
        const tsType = fieldToTsType(field, pluginFieldTypes, hoistedPublic, 'public');
        if (tsType === null) continue;
        const optional = field.required === true ? '' : '?';
        fieldPublicLines.push(`  ${propertyKey(field.name)}${optional}: ${tsType};`);
    }

    // Always add the __shape brand marker for public types.
    const publicBodyLines = ["  readonly __shape?: 'public';", ...fieldPublicLines];
    const mainPublicType = `export type ${fieldsPublicName} = {\n${publicBodyLines.join('\n')}\n};`;

    const fieldsPublicType =
        hoistedPublic.length > 0
            ? `${hoistedPublic.join('\n\n')}\n\n${mainPublicType}`
            : mainPublicType;

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

    return { collectionKey, fieldsType, fieldsPublicType, relationsType };
}

// ============================================================================
// Main Export
// ============================================================================

/**
 * Generate the full content of the `.astro/astromech.d.ts` type declaration file.
 */

/** Derive the type-name prefix for a plugin entry type. */
function pluginEntryPrefix(pluginName: string, typeName: string): string {
    return `Plugin${toPascalCase(pluginName)}${toPascalCase(typeName)}`;
}

type PluginEntryBlock = {
    pluginName: string;
    typeName: string;
    fieldsType: string;
    fieldsPublicType: string;
    relationsType: string;
};

/**
 * Generate per-plugin entry types (`Fields`/`FieldsPublic`/`Relations`),
 * so a root collection's relationship field can target a qualified plugin entry
 * type (`redirects/redirect`). Returns an empty array when there are no plugin
 * entries.
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

            // Reuse collection codegen with plugin-prefixed type names.
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
                fieldsType: block.fieldsType,
                fieldsPublicType: block.fieldsPublicType,
                relationsType: block.relationsType,
            });

            // Register qualified target so other fields can reference it.
            // For full shape, map to the full Fields type.
            // For public shape, callers use the public variant directly.
            qualifiedTargetMap.set(`${pluginName}/${typeName}`, `${prefix}Fields`);
        }
    }

    return blocks;
}

/**
 * `declare module` augmentation for installed plugins: declared `hookEvents`
 * on `AstromechPluginHookEvents`. Service method signatures are not emitted
 * here — plugins self-augment `AstromechPluginServices` in their own `.d.ts`.
 */
function generatePluginAugmentations(plugins: PluginDefinition[]): string[] {
    const eventLines = plugins.flatMap((def) =>
        (def.hookEvents ?? []).map((event) => `    '${event}': unknown;`)
    );

    if (eventLines.length === 0) {
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
        '}',
    ];
}

export function generateClientTypes(
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
        .map(({ collectionKey, fieldsType, fieldsPublicType, relationsType }) => {
            const pascal = toPascalCase(collectionKey);
            return [
                `// --- Collection: ${collectionKey} (${pascal}) ---`,
                '',
                fieldsType,
                '',
                fieldsPublicType,
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
                block.fieldsType,
                '',
                block.fieldsPublicType,
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

    parts.push(...generatePluginAugmentations(plugins), '', 'export {};', '');

    return parts.join('\n');
}
