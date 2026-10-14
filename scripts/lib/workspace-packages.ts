/**
 * The workspace's packages, as pnpm lists them (`pnpm ls -r --json --depth -1`).
 * The root package is left out.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { capture } from './run.ts';

/** The `package.json` fields a workspace package uses here. */
export type Manifest = {
    name: string;
    private?: boolean;
    scripts?: Record<string, string>;
};

export type WorkspacePackage = {
    name: string;
    /** Absolute. */
    directory: string;
    manifest: Manifest;
};

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
            stderr: 'pipe',
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
