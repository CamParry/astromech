/**
 * Vite plugins for the `virtual:astromech/*` modules the admin and the SSR
 * graph import.
 */

export type VirtualModulePlugin = {
    name: string;
    resolveId(id: string): string | undefined;
    load(id: string): string | undefined;
};

/** Serve one virtual module id from `load`, under Rollup's `\0` convention. */
export function virtualModule(id: string, load: () => string): VirtualModulePlugin {
    const resolvedId = `\0${id}`;
    return {
        name: id,
        resolveId: (candidate) => (candidate === id ? resolvedId : undefined),
        load: (candidate) => (candidate === resolvedId ? load() : undefined),
    };
}
