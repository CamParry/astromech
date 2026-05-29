/**
 * Plugin identity derivation and validation.
 *
 * Identity = canonical `package` (stable, survives renames) + `name` (access
 * key on `Astromech.plugins.X`). The access key defaults to the last path
 * segment of the package and is overridable via `alias`. The
 * `permissionNamespace` defaults to the sanitised package and anchors
 * permission strings.
 */

import type { PluginDefinition, ResolvedPluginIdentity } from '@/types/index.js';

/** `@astromech/redirects` → `astromech-redirects` (lowercase, no `@`, `/`→`-`). */
export function sanitisePackage(pkg: string): string {
    return pkg.toLowerCase().replace(/@/g, '').replace(/\//g, '-');
}

/** Last path segment: `@astromech/redirects` → `redirects`, `redirects` → `redirects`. */
export function derivePluginName(pkg: string): string {
    const segments = pkg.split('/');
    return segments[segments.length - 1] ?? pkg;
}

/** Compute the full identity for a single plugin definition. */
export function resolvePluginIdentity(def: PluginDefinition): ResolvedPluginIdentity {
    const name = def.alias ?? def.name ?? derivePluginName(def.package);
    const identity: ResolvedPluginIdentity = {
        package: def.package,
        name,
        alias: name,
        permissionNamespace: def.permissionNamespace ?? sanitisePackage(def.package),
    };
    if (def.version !== undefined) {
        identity.version = def.version;
    }
    return identity;
}

/**
 * Throw a build error if two plugins resolve to the same access key. The user
 * resolves collisions by setting `alias` on one of them.
 */
export function assertNoPluginCollisions(defs: PluginDefinition[]): ResolvedPluginIdentity[] {
    const identities = defs.map(resolvePluginIdentity);
    const seen = new Map<string, string>();

    for (const id of identities) {
        const existing = seen.get(id.name);
        if (existing !== undefined) {
            throw new Error(
                `Astromech plugin access-key collision: "${id.name}" is used by both ` +
                    `"${existing}" and "${id.package}". Set \`alias\` on one of them to disambiguate.`
            );
        }
        seen.set(id.name, id.package);
    }

    return identities;
}

// ============================================================================
// Dependency checks (existence + basic semver range)
// ============================================================================

type SemVer = { major: number; minor: number; patch: number };

function parseVersion(version: string): SemVer | null {
    const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version.trim().replace(/^v/, ''));
    if (!match) return null;
    return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

function compare(a: SemVer, b: SemVer): number {
    return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

/**
 * A deliberately small range satisfier covering the common operators
 * (`*`, exact, `^`, `~`, `>=`, `>`, `<=`, `<`). Not a full semver
 * implementation — basic by design.
 */
export function satisfiesRange(version: string, range: string): boolean {
    const trimmed = range.trim();
    if (trimmed === '' || trimmed === '*' || trimmed === 'latest') return true;

    const v = parseVersion(version);
    if (!v) return false;

    const operatorMatch = /^(\^|~|>=|>|<=|<|=)?\s*(.+)$/.exec(trimmed);
    if (!operatorMatch) return false;
    const operator = operatorMatch[1] ?? '=';
    const target = parseVersion(operatorMatch[2] ?? '');
    if (!target) return false;

    const cmp = compare(v, target);
    switch (operator) {
        case '=':
            return cmp === 0;
        case '>':
            return cmp > 0;
        case '>=':
            return cmp >= 0;
        case '<':
            return cmp < 0;
        case '<=':
            return cmp <= 0;
        case '^':
            // Compatible within the same major (or minor when major is 0).
            if (cmp < 0) return false;
            return target.major === 0
                ? v.major === 0 && v.minor === target.minor
                : v.major === target.major;
        case '~':
            // Compatible within the same minor.
            if (cmp < 0) return false;
            return v.major === target.major && v.minor === target.minor;
        default:
            return false;
    }
}

/**
 * Validate `dependsOn` declarations across the loaded plugin set: each
 * dependency must be present, and (when both versions are known) satisfy the
 * declared range. No auto-install / negotiation. Throws a build error on
 * failure.
 */
export function checkPluginDependencies(defs: PluginDefinition[]): void {
    const byPackage = new Map<string, PluginDefinition>();
    for (const def of defs) {
        byPackage.set(def.package, def);
    }

    for (const def of defs) {
        for (const [depPackage, range] of Object.entries(def.dependsOn ?? {})) {
            const dep = byPackage.get(depPackage);
            if (!dep) {
                throw new Error(
                    `Astromech plugin "${def.package}" depends on "${depPackage}", which is not installed. ` +
                        `Add it to your \`plugins\` array.`
                );
            }
            if (dep.version !== undefined && !satisfiesRange(dep.version, range)) {
                throw new Error(
                    `Astromech plugin "${def.package}" requires "${depPackage}@${range}", ` +
                        `but version ${dep.version} is installed.`
                );
            }
        }
    }
}
