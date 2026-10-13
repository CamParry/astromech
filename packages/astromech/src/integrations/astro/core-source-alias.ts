/**
 * The Vite plugin that resolves core onto its source in the site's build: core's
 * `@/` specifiers for importers inside core's `src`, and each `astromech`
 * subpath that core's `exports` builds into `dist`, for every importer.
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

/** The `exports` field of core's `package.json`, as far as this reads it. */
export type PackageExports = Record<
    string,
    string | { types?: string; default?: string }
>;

/**
 * Resolve each `astromech` subpath in `distSubpaths` to its entry in
 * `src/exports`, and `@/` against core's `src` when the importer is inside it.
 *
 * The site's Vite compiles core's source for the subpaths that point at `src`
 * (the injected route handler, the image component). Were the other subpaths
 * left on `dist`, the bundle would hold a second copy of core, and an error
 * thrown by one copy would fail an `instanceof` check in the other. The `@/`
 * half is scoped so a site that aliases `@/` to its own `src` keeps that alias
 * for its own files.
 */
export function coreSourceAlias(
    packageSource: string,
    distSubpaths: readonly string[]
): CoreSourceAliasPlugin {
    const root = toForwardSlashes(packageSource) + '/';
    const entries = new Map(
        distSubpaths.map((subpath) => [
            specifierOf(subpath),
            root + 'exports/' + sourceEntryOf(subpath),
        ])
    );
    return {
        name: 'astromech:core-source-alias',
        enforce: 'pre',
        resolveId(id, importer, options) {
            const entry = entries.get(id);
            if (entry !== undefined) {
                return this.resolve(entry, importer, { ...options, skipSelf: true });
            }
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

/** The subpaths (`.`, `./fields`, …) whose `default` target is in `dist`. */
export function listDistSubpaths(exports: PackageExports): string[] {
    return Object.entries(exports)
        .filter(([, target]) => {
            const file = typeof target === 'string' ? target : target.default;
            return file?.startsWith('./dist/') === true;
        })
        .map(([subpath]) => subpath);
}

/** `.` is `astromech`; `./database/d1` is `astromech/database/d1`. */
function specifierOf(subpath: string): string {
    return subpath === '.' ? 'astromech' : 'astromech/' + subpath.slice(2);
}

/**
 * The file in `src/exports` a subpath's build starts from: `index.ts` for `.`,
 * and the subpath with each `/` as `-` for the rest (`./database/d1` is
 * `database-d1.ts`), as `tsup.config.ts` names them.
 */
function sourceEntryOf(subpath: string): string {
    return subpath === '.' ? 'index.ts' : subpath.slice(2).replaceAll('/', '-') + '.ts';
}

function toForwardSlashes(path: string): string {
    return path.replace(/\\/g, '/');
}
