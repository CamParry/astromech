/**
 * `astromech/shared` and `astromech/fetch` bundle for the browser: no Node
 * builtin is reached, and every core file they pull in is on the allowlist.
 */

import type { Metafile, Plugin } from 'esbuild';
import { builtinModules } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { beforeAll, describe, expect, it } from 'vitest';

const packageRoot = fileURLToPath(new URL('../..', import.meta.url));

const entryPoints = ['src/exports/shared.ts', 'src/exports/fetch.ts'];

/** Core source the browser entries may reach. Third-party packages are not listed. */
const allowlist = [
    /^src\/exports\/(shared|fetch)\.ts$/,
    /^src\/fields\//,
    /^src\/utilities\//,
    /^src\/errors\//,
    /^src\/types\//,
    /\.shared\.tsx?$/,
    /^src\/transport\/http\/client\.ts$/,
];

const builtinNames = builtinModules.filter(
    (name) => !name.startsWith('node:') && !name.includes('/')
);
const builtinFilter = new RegExp(`^(node:.*|(${builtinNames.join('|')})(/.*)?)$`);

/** Marks every Node builtin external, so the metafile records who imported it. */
const externalBuiltins: Plugin = {
    name: 'external-builtins',
    setup(pluginBuild) {
        pluginBuild.onResolve({ filter: builtinFilter }, (args) => ({
            path: args.path,
            external: true,
        }));
    },
};

let metafile: Metafile;

beforeAll(async () => {
    const result = await build({
        absWorkingDir: packageRoot,
        entryPoints,
        tsconfig: 'tsconfig.json',
        platform: 'browser',
        format: 'esm',
        bundle: true,
        write: false,
        metafile: true,
        outdir: 'out',
        logLevel: 'silent',
        plugins: [externalBuiltins],
    });
    metafile = result.metafile;
});

describe('the browser entries', () => {
    it('reach no Node builtin', () => {
        const reached = Object.entries(metafile.inputs).flatMap(([file, input]) =>
            input.imports
                .filter(
                    (entry) => entry.external === true && builtinFilter.test(entry.path)
                )
                .map((entry) => `${entry.path}, reached through ${chainTo(file)}`)
        );

        expect(reached).toEqual([]);
    });

    it('reach only allowlisted core files', () => {
        const outside = Object.keys(metafile.inputs)
            .filter((file) => !file.includes('node_modules/'))
            .filter((file) => !allowlist.some((pattern) => pattern.test(file)))
            .map((file) => `${file}, reached through ${chainTo(file)}`);

        expect(outside).toEqual([]);
    });
});

/** The import chain from an entry point to `target`, found breadth first. */
function chainTo(target: string): string {
    const parents = new Map<string, string | null>(
        entryPoints.map((entry) => [entry, null])
    );
    const queue = [...entryPoints];
    for (let file = queue.shift(); file !== undefined; file = queue.shift()) {
        if (file === target) break;
        for (const entry of metafile.inputs[file]?.imports ?? []) {
            if (entry.external === true || parents.has(entry.path)) continue;
            parents.set(entry.path, file);
            queue.push(entry.path);
        }
    }
    const chain: string[] = [];
    for (
        let file: string | null | undefined = target;
        file != null;
        file = parents.get(file)
    ) {
        chain.unshift(file);
    }
    return chain.join(' -> ');
}
