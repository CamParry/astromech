/**
 * The workspace's packages, read from the `packages` globs in
 * `pnpm-workspace.yaml`, and the packages a package depends on.
 *
 * The globs it reads are a directory (`packages/admin`) or a directory's
 * children (`packages/plugins/*`), the two forms the file uses. It throws on
 * any other, rather than skip a package.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The `package.json` fields that name another workspace package. */
const DEPENDENCY_FIELDS = [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
];

/**
 * Every workspace package, each as `{ name, directory, manifest }`, with
 * `directory` absolute.
 */
export function workspacePackages(repoRoot) {
    const packages = [];
    for (const pattern of workspaceGlobs(repoRoot)) {
        for (const directory of matchingDirectories(repoRoot, pattern)) {
            const manifest = readManifest(directory);
            if (manifest !== undefined) {
                packages.push({ name: manifest.name, directory, manifest });
            }
        }
    }
    return packages;
}

/**
 * The workspace packages `root` depends on, directly or through another, in
 * any dependency field, as Turborepo's `^build` follows them. `root` itself is
 * left out.
 */
export function workspaceDependencies(packages, root) {
    const byName = new Map(packages.map((each) => [each.name, each]));
    const found = new Map();
    const visit = (manifest) => {
        for (const field of DEPENDENCY_FIELDS) {
            for (const name of Object.keys(manifest[field] ?? {})) {
                const dependency = byName.get(name);
                if (dependency === undefined || found.has(name) || name === root.name) {
                    continue;
                }
                found.set(name, dependency);
                visit(dependency.manifest);
            }
        }
    };
    visit(root.manifest);
    return [...found.values()];
}

function workspaceGlobs(repoRoot) {
    const lines = readFileSync(join(repoRoot, 'pnpm-workspace.yaml'), 'utf8').split('\n');
    const start = lines.findIndex((line) => line.trim() === 'packages:');
    if (start === -1) throw new Error('pnpm-workspace.yaml has no packages list');
    const globs = [];
    for (const line of lines.slice(start + 1)) {
        const item = /^\s+-\s+['"]?([^'"]+)['"]?\s*$/.exec(line);
        if (item === null) break;
        globs.push(item[1]);
    }
    return globs;
}

function matchingDirectories(repoRoot, pattern) {
    if (!pattern.includes('*')) return [join(repoRoot, pattern)];
    if (!pattern.endsWith('/*') || pattern.slice(0, -2).includes('*')) {
        throw new Error(`pnpm-workspace.yaml: unsupported glob ${pattern}`);
    }
    const parent = join(repoRoot, pattern.slice(0, -2));
    return readdirSync(parent, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => join(parent, entry.name));
}

function readManifest(directory) {
    try {
        return JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
    } catch (error) {
        if (error.code === 'ENOENT') return undefined;
        throw error;
    }
}
