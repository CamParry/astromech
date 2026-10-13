/**
 * The workspace's packages, as pnpm lists them (`pnpm ls -r --json --depth -1`),
 * and the packages a package depends on. The root package is left out.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { capture } from './run.ts';

/** The `package.json` fields a workspace package uses here. */
export type Manifest = {
    name: string;
    private?: boolean;
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
};

export type WorkspacePackage = {
    name: string;
    /** Absolute. */
    directory: string;
    manifest: Manifest;
};

/** The `package.json` fields that name another workspace package. */
const DEPENDENCY_FIELDS = [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
] as const;

/** What `workspacePackages` read, by repository root: one `pnpm ls` per run. */
const read = new Map<string, WorkspacePackage[]>();

/** Every workspace package but the root, each with its directory and manifest. */
export function workspacePackages(repoRoot: string): WorkspacePackage[] {
    const root = resolve(repoRoot);
    let packages = read.get(root);
    if (packages === undefined) {
        packages = listPackages(root);
        read.set(root, packages);
    }
    return packages;
}

function listPackages(root: string): WorkspacePackage[] {
    const listed = JSON.parse(
        capture('pnpm', ['ls', '-r', '--json', '--depth', '-1'], {
            cwd: root,
            stdio: ['ignore', 'pipe', 'pipe'],
        })
    ) as { name: string; path: string }[];
    return listed
        .filter(({ path }) => resolve(path) !== root)
        .map(({ name, path }) => ({
            name,
            directory: path,
            manifest: JSON.parse(
                readFileSync(join(path, 'package.json'), 'utf8')
            ) as Manifest,
        }));
}

/**
 * The workspace packages `root` depends on, directly or through another, in
 * any dependency field, as Turborepo's `^build` follows them. `root` itself is
 * left out.
 */
export function workspaceDependencies(
    packages: readonly WorkspacePackage[],
    root: WorkspacePackage
): WorkspacePackage[] {
    const byName = new Map(packages.map((each) => [each.name, each]));
    const found = new Map<string, WorkspacePackage>();
    const visit = (manifest: Manifest): void => {
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
