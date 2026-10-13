/**
 * Tests of `scripts/lib/workspace-packages.ts` against this repository's own
 * workspace.
 */
import type { WorkspacePackage } from './workspace-packages.ts';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { workspaceDependencies, workspacePackages } from './workspace-packages.ts';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const packages = workspacePackages(repoRoot);
const named = (name: string): WorkspacePackage => {
    const found = packages.find((each) => each.name === name);
    assert.ok(found, name);
    return found;
};
const dependencyNames = (name: string): string[] =>
    workspaceDependencies(packages, named(name))
        .map((each) => each.name)
        .toSorted();

test('every package in pnpm-workspace.yaml is listed, and the root is not', () => {
    for (const name of [
        'astromech',
        '@astromech/admin',
        '@astromech/schema-engine',
        '@astromech/seo',
        'astromech-demo',
        'astromech-demo-cloudflare',
        '@astromech/scripts',
    ]) {
        assert.ok(named(name), name);
    }
    assert.equal(
        packages.some((each) => each.name === 'astromech-monorepo'),
        false
    );
});

test('the dependencies of a package include those of its dependencies', () => {
    // The Cloudflare demo names only core, which names the admin and the schema engine.
    assert.deepEqual(dependencyNames('astromech-demo-cloudflare'), [
        '@astromech/admin',
        '@astromech/schema-engine',
        'astromech',
    ]);
});

test('a cycle through a devDependency ends, and leaves the package out', () => {
    // Core depends on the admin, and the admin has a devDependency on core.
    assert.deepEqual(dependencyNames('@astromech/admin'), [
        '@astromech/schema-engine',
        'astromech',
    ]);
});
