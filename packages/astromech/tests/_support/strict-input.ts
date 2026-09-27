/**
 * Walks a method's input schema for the objects that accept a key they do not
 * declare, and for every key it declares. Reads Zod's internal `_zod.def`, so a
 * package that resolves core through `dist` can use it too.
 */

type SchemaDef = {
    type: string;
    shape?: Record<string, unknown>;
    catchall?: unknown;
    element?: unknown;
    innerType?: unknown;
    options?: readonly unknown[];
    left?: unknown;
    right?: unknown;
    in?: unknown;
    out?: unknown;
    items?: readonly unknown[];
    rest?: unknown;
    getter?: () => unknown;
};

/** The input schemas the checks walk, each under its method's name. */
export type MethodInputs = Record<string, unknown>;

/** Each method's `input` in `methods`, under `<prefix>.<name>`, or `<name>` bare. */
export function methodInputs(methods: object, prefix?: string): MethodInputs {
    return Object.fromEntries(
        Object.entries(methods as Record<string, { input?: unknown }>).map(
            ([name, method]) => [
                prefix === undefined ? name : `${prefix}.${name}`,
                method.input,
            ]
        )
    );
}

/**
 * The path of every object under each input in `inputs` that accepts an unknown
 * key, as `<name>` or `<name>.<key>...`. A record is skipped: its keys are data.
 */
export function openInputObjects(inputs: MethodInputs): string[] {
    const open: string[] = [];
    for (const [name, schema] of Object.entries(inputs)) {
        walk(schema, name, open, new Set());
    }
    return open;
}

/**
 * Every key `schema` declares, at any depth, as a sorted list of dotted paths
 * (`data.title`, `items[].id`). A record's keys are data, so none are listed.
 */
export function inputKeys(schema: unknown): string[] {
    const keys = new Set<string>();
    walk(schema, '', [], new Set(), (path) => keys.add(path));
    return [...keys].sort();
}

/**
 * Walk `schema`, noting each open object in `open` and passing each declared
 * key's path to `onKey`. `ancestors` holds the schemas above this one, so a
 * recursive schema ends while a schema shared by two keys is walked under both.
 */
function walk(
    schema: unknown,
    path: string,
    open: string[],
    ancestors: Set<unknown>,
    onKey?: (path: string) => void
): void {
    const def = defOf(schema);
    if (def === undefined || ancestors.has(schema)) return;
    ancestors.add(schema);
    try {
        walkDef(def, path, open, ancestors, onKey);
    } finally {
        ancestors.delete(schema);
    }
}

function walkDef(
    def: SchemaDef,
    path: string,
    open: string[],
    ancestors: Set<unknown>,
    onKey: ((path: string) => void) | undefined
): void {
    const next = (child: unknown, suffix = ''): void =>
        walk(child, `${path}${suffix}`, open, ancestors, onKey);

    switch (def.type) {
        case 'object':
            if (defOf(def.catchall)?.type !== 'never') open.push(path);
            for (const [key, child] of Object.entries(def.shape ?? {})) {
                const keyPath = path === '' ? key : `${path}.${key}`;
                onKey?.(keyPath);
                walk(child, keyPath, open, ancestors, onKey);
            }
            return;
        case 'record':
            return;
        case 'array':
            next(def.element, '[]');
            return;
        case 'union':
            for (const option of def.options ?? []) next(option);
            return;
        case 'intersection':
            next(def.left);
            next(def.right);
            return;
        case 'pipe':
            next(def.in);
            next(def.out);
            return;
        case 'tuple':
            for (const item of def.items ?? []) next(item, '[]');
            next(def.rest, '[]');
            return;
        case 'lazy':
            next(def.getter?.());
            return;
        default:
            // Optional, nullable, default, catch, readonly and the like wrap one
            // schema; a leaf has none.
            next(def.innerType);
    }
}

function defOf(schema: unknown): SchemaDef | undefined {
    if (typeof schema !== 'object' || schema === null || !('_zod' in schema)) {
        return undefined;
    }
    return (schema as { _zod: { def: SchemaDef } })._zod.def;
}
