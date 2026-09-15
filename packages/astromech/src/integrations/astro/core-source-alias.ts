/**
 * The Vite plugin that resolves core's `@/` specifiers in the site's build, for
 * importers inside core's `src` only.
 */

/** The part of Vite's plugin context the plugin calls. */
export type ResolveContext = {
    resolve: (
        id: string,
        importer?: string,
        options?: { skipSelf?: boolean }
    ) => Promise<{ id: string } | null>;
};

/**
 * Minimal Vite plugin shape for the alias. Astro's `updateConfig` type erases
 * hook signatures, so this one types `this.resolve` itself.
 */
export type CoreSourceAliasPlugin = {
    name: string;
    enforce: 'pre';
    resolveId: (
        this: ResolveContext,
        id: string,
        importer: string | undefined,
        options: object
    ) => Promise<{ id: string } | null> | null;
};

/**
 * Resolve `@/` against core's `src` when the importer is inside it. Scoped so a
 * site that aliases `@/` to its own `src` keeps that alias for its own files.
 */
export function coreSourceAlias(packageSource: string): CoreSourceAliasPlugin {
    const root = toForwardSlashes(packageSource) + '/';
    return {
        name: 'astromech:core-source-alias',
        enforce: 'pre',
        resolveId(id, importer, options) {
            if (!id.startsWith('@/') || importer === undefined) return null;
            const importerFile = toForwardSlashes(importer.replace(/\?.*$/, ''));
            if (!importerFile.startsWith(root)) return null;
            return this.resolve(root + id.slice(2), importer, {
                ...options,
                skipSelf: true,
            });
        },
    };
}

function toForwardSlashes(path: string): string {
    return path.replace(/\\/g, '/');
}
