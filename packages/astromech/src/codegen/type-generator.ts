/**
 * Generates the `.astro/astromech.d.ts` client type declarations from the
 * resolved config, so `Astromech.entryTypes.posts.get()` returns a typed
 * entry specific to the `posts` entry type.
 */

import type {
    DataField,
    Field,
    PluginDefinition,
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
    taken: Set<string>
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
            const tsType = fieldToTsType(field, shape, emit);
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
    emit: TsTypeEmit
): string | null {
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
    } else if (knownCollections.has(field.target)) {
        const pascal = typeNamePrefix(field.target);
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
    knownCollections: Set<string>
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
        taken
    )(columns).map((line) => `  ${line}`);
    const fieldPublicLines = scopeRenderer(
        pascal,
        'public',
        hoistedPublic,
        taken
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
        const relType = fieldToRelationType(field, knownCollections, 'full');
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
 * The type-name prefix for an entry type or global id: the pascal-cased id,
 * a plugin's namespace included, e.g. `forms/form` → `FormsForm`.
 */
function typeNamePrefix(id: string): string {
    return toPascalCase(id.replaceAll('/', '_'));
}

/**
 * Claim a type-name prefix for `id`, throwing when another id already has it:
 * two declarations of one generated name would not compile.
 */
function claimPrefix(taken: Map<string, string>, prefix: string, id: string): string {
    const holder = taken.get(prefix);
    if (holder !== undefined) {
        throw new Error(
            `Astromech codegen: "${holder}" and "${id}" both generate the type name ` +
                `prefix "${prefix}". Rename one of them.`
        );
    }
    taken.set(prefix, id);
    return prefix;
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
    plugins: PluginDefinition[] = []
): string {
    const knownCollections = new Set(Object.keys(config.entryTypes));
    const taken = new Map<string, string>();

    const entryBlocks = Object.entries(config.entryTypes).map(([id, entryType]) => ({
        id,
        ...generateCollectionTypes(
            claimPrefix(taken, typeNamePrefix(id), id),
            entryType.fields,
            knownCollections
        ),
    }));

    const globalBlocks = Object.entries(config.globals).map(([id, global]) => {
        const prefix = claimPrefix(taken, `${typeNamePrefix(id)}Global`, id);
        return {
            id,
            prefix,
            fieldsType: generateCollectionTypes(prefix, global.fields, knownCollections)
                .fieldsType,
        };
    });

    const augmentationLines = entryBlocks
        .map(({ id, collectionKey }) => {
            return `    ${propertyKey(id)}: { fields: ${collectionKey}Fields; fieldsPublic: ${collectionKey}FieldsPublic; relations: ${collectionKey}Relations };`;
        })
        .join('\n');

    const entryTypeBlocks = entryBlocks
        .map(({ id, collectionKey, fieldsType, fieldsPublicType, relationsType }) =>
            [
                `// --- Entry type: ${id} (${collectionKey}) ---`,
                '',
                fieldsType,
                '',
                fieldsPublicType,
                '',
                relationsType,
            ].join('\n')
        )
        .join('\n\n');

    const globalAugmentationLines = globalBlocks
        .map(({ id, prefix }) => `    ${propertyKey(id)}: { fields: ${prefix}Fields };`)
        .join('\n');

    const globalTypeBlocks = globalBlocks
        .map(({ id, prefix, fieldsType }) =>
            [`// --- Global: ${id} (${prefix}) ---`, '', fieldsType].join('\n')
        )
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
        entryTypeBlocks,
    ];

    if (globalTypeBlocks) {
        parts.push('', globalTypeBlocks);
    }

    parts.push(...generatePluginAugmentations(plugins), '', 'export {};', '');

    return parts.join('\n');
}
