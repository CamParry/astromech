/**
 * Generates the `.astro/astromech.d.ts` client type declarations from the
 * resolved config, so `Astromech.entryTypes.posts.get()` returns a typed
 * entry specific to the `posts` entry type.
 */

import type {
    DataField,
    Field,
    PluginDefinition,
    PluginFieldTypeRegistration,
    ResolvedConfig,
    ResolvedEntryFields,
    TsTypeEmit,
} from '@/types/index';
import { getFieldType } from '@/fields/field-type-registry';
import { flattenFieldNodes } from '@/fields/flatten';

/**
 * Convert a collection slug (snake_case, kebab-case, camelCase) to PascalCase.
 * e.g. "blog_posts" → "BlogPosts", "my-collection" → "MyCollection"
 */
function toPascalCase(name: string): string {
    return name
        .replace(/[-_](.)/g, (_, char: string) => char.toUpperCase())
        .replace(/^(.)/, (_, char: string) => char.toUpperCase());
}

/**
 * Field types that produce a relation (populate-able) value.
 */
const RELATION_TYPES = new Set(['relationship', 'media']);

/** Quote property names that aren't valid TS identifiers (e.g. `seo-meta`). */
function propertyKey(name: string): string {
    return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name);
}

/**
 * The data fields of one value scope, layout fields flattened in place. When
 * `shape === 'public'`, private fields (including those under a private layout
 * field) are excluded.
 */
function collectDataFields(fields: Field[], shape: 'full' | 'public'): DataField[] {
    const dataFields = flattenFieldNodes(fields);
    return shape === 'public'
        ? dataFields.filter((field) => field.private !== true)
        : dataFields;
}

/**
 * The property-line renderer for one entry type in one shape. Named types a
 * field type declares through `emit.alias` are prefixed with the entry type's
 * name, collected into `hoisted`, and kept unique through `taken`.
 */
function scopeRenderer(
    prefix: string,
    shape: 'full' | 'public',
    hoisted: string[],
    taken: Set<string>,
    pluginFieldTypes: Map<string, PluginFieldTypeRegistration>
): (fields: Field[]) => string[] {
    const emit: TsTypeEmit = {
        properties: (fields) => propertyLines(fields),
        alias: (name, body) => {
            const base = `${prefix}${toPascalCase(name)}`;
            let ref = base;
            for (let n = 2; taken.has(ref); n += 1) ref = `${base}${n}`;
            taken.add(ref);
            hoisted.push(`export type ${ref} = ${body(ref)};`);
            return ref;
        },
    };

    function propertyLines(fields: Field[]): string[] {
        const lines: string[] = [];
        for (const field of collectDataFields(fields, shape)) {
            const tsType = fieldToTsType(field, shape, emit, pluginFieldTypes);
            if (tsType === null) continue;
            const optional = field.required === true ? '' : '?';
            lines.push(`${propertyKey(field.name)}${optional}: ${tsType};`);
        }
        return lines;
    }

    return propertyLines;
}

/**
 * Map a data field to its TypeScript type string, or null to omit it: an
 * unregistered type is omitted, and a type with no `tsType` is `JsonValue`.
 */
function fieldToTsType(
    field: DataField,
    shape: 'full' | 'public',
    emit: TsTypeEmit,
    pluginFieldTypes: Map<string, PluginFieldTypeRegistration>
): string | null {
    const pluginType = pluginFieldTypes.get(field.type);
    if (pluginType) {
        // No typeGen → JsonValue. A typeGen returning null opts out entirely
        // (presentational field, no stored data) and is skipped by the caller.
        if (pluginType.typeGen === undefined) return "import('astromech').JsonValue";
        return pluginType.typeGen(field);
    }

    const fieldType = getFieldType(field.type);
    if (fieldType === undefined) return null;
    if (fieldType.tsType === undefined) return "import('astromech').JsonValue";
    return fieldType.tsType(field, shape, emit);
}

/**
 * Map a Field to its populated TypeScript type string for the Relations
 * type; null if the field is not a relation/media field. `shape` selects
 * between `…Fields` and `…FieldsPublic` target references.
 */
function fieldToRelationType(
    field: DataField,
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

    const columns = [...fields.main, ...fields.sidebar];
    const allFields = collectDataFields(columns, 'full');

    // Declarations hoisted by nested field types (e.g. tree node types that
    // must be named to allow self-reference), placed before the Fields type.
    const taken = new Set<string>();
    const hoisted: string[] = [];
    const hoistedPublic: string[] = [];
    const fieldLines = scopeRenderer(
        pascal,
        'full',
        hoisted,
        taken,
        pluginFieldTypes
    )(columns).map((line) => `  ${line}`);
    const fieldPublicLines = scopeRenderer(
        pascal,
        'public',
        hoistedPublic,
        taken,
        pluginFieldTypes
    )(columns).map((line) => `  ${line}`);

    // A type alias, not an interface: only an alias of an object type gets the
    // implicit index signature that makes it assignable to `Entry['fields']`
    // (`JsonObject`); an interface never does.
    const mainType =
        fieldLines.length > 0
            ? `export type ${fieldsName} = {\n${fieldLines.join('\n')}\n};`
            : `export type ${fieldsName} = {};`;
    const fieldsType =
        hoisted.length > 0 ? `${hoisted.join('\n\n')}\n\n${mainType}` : mainType;

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

/**
 * Derive the type-name prefix for a global: the pascal-cased key plus
 * `Global`, so `generateCollectionTypes` names its fields type
 * `<Key>GlobalFields`.
 */
function globalPrefix(key: string): string {
    return `${toPascalCase(key)}Global`;
}

/** Derive the type-name prefix for a plugin's global, e.g. `seo/settings` → `SeoSettingsGlobal`. */
function pluginGlobalPrefix(pluginName: string, key: string): string {
    return `${toPascalCase(pluginName)}${toPascalCase(key)}Global`;
}

type GlobalBlock = {
    /** The global's addressable id — bare key, or `<namespace>/<key>`. */
    globalId: string;
    prefix: string;
    fieldsType: string;
};

/**
 * Generate the fields type for every host and plugin global. Relations inside
 * a global resolve their targets exactly as a collection's do, so the same
 * known-collection and qualified-target maps are passed through.
 */
function generateGlobalBlocks(
    config: ResolvedConfig,
    knownCollections: Set<string>,
    qualifiedTargetMap: Map<string, string>,
    pluginFieldTypes: Map<string, PluginFieldTypeRegistration>
): GlobalBlock[] {
    const blocks: GlobalBlock[] = [];

    const emit = (globalId: string, prefix: string, fields: ResolvedEntryFields) => {
        const block = generateCollectionTypes(
            prefix,
            fields,
            knownCollections,
            pluginFieldTypes,
            qualifiedTargetMap
        );
        blocks.push({ globalId, prefix, fieldsType: block.fieldsType });
    };

    for (const [key, global] of Object.entries(config.globals ?? {})) {
        emit(key, globalPrefix(key), global.fields);
    }

    for (const [pluginName, globals] of Object.entries(config.pluginGlobals ?? {})) {
        for (const [key, global] of Object.entries(globals)) {
            emit(
                `${pluginName}/${key}`,
                pluginGlobalPrefix(pluginName, key),
                global.fields
            );
        }
    }

    return blocks;
}

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
 * Generate per-plugin entry types (`Fields`/`FieldsPublic`/`Relations`), so
 * a root collection's relationship field can target a qualified plugin entry
 * type (`redirects/redirect`). Empty array when there are no plugin entries.
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

/** Generate the full content of the `.astro/astromech.d.ts` type declaration file. */
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
            return `    ${propertyKey(collectionKey)}: { fields: ${pascal}Fields; fieldsPublic: ${pascal}FieldsPublic; relations: ${pascal}Relations };`;
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

    const globalBlocks = generateGlobalBlocks(
        config,
        knownCollections,
        qualifiedTargetMap,
        pluginFieldTypes
    );

    const globalAugmentationLines = globalBlocks
        .map(
            ({ globalId, prefix }) =>
                `    ${propertyKey(globalId)}: { fields: ${prefix}Fields };`
        )
        .join('\n');

    const globalTypeBlocks = globalBlocks
        .map(({ globalId, prefix, fieldsType }) => {
            const label = globalId.includes('/') ? 'Plugin global' : 'Global';
            return [`// --- ${label}: ${globalId} (${prefix}) ---`, '', fieldsType].join(
                '\n'
            );
        })
        .join('\n\n');

    const parts: string[] = [
        '// Auto-generated by Astromech. Do not edit.',
        '',
        "declare module 'astromech' {",
        '  interface AstromechEntryTypes {',
        augmentationLines,
        '  }',
        '  interface AstromechGlobalTypes {',
        globalAugmentationLines,
        '  }',
        '}',
        '',
        collectionTypeBlocks,
    ];

    if (pluginEntryTypeBlocks) {
        parts.push('', pluginEntryTypeBlocks);
    }

    if (globalTypeBlocks) {
        parts.push('', globalTypeBlocks);
    }

    parts.push(...generatePluginAugmentations(plugins), '', 'export {};', '');

    return parts.join('\n');
}
