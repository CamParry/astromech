/**
 * Finds the objects in a method's input schema that accept a key they do not
 * declare. Reads Zod's internal `_zod.def` rather than importing Zod, so a
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

function walk(schema: unknown, path: string, open: string[], seen: Set<unknown>): void {
    const def = defOf(schema);
    if (def === undefined || seen.has(schema)) return;
    seen.add(schema);

    const next = (child: unknown, suffix = ''): void =>
        walk(child, `${path}${suffix}`, open, seen);

    switch (def.type) {
        case 'object':
            if (defOf(def.catchall)?.type !== 'never') open.push(path);
            for (const [key, child] of Object.entries(def.shape ?? {})) {
                next(child, `.${key}`);
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
