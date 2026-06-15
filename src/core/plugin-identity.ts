/**
 * Plugin identity derivation and validation.
 *
 * Identity = canonical `package` (stable, survives renames) + `name` (access
 * key on `Astromech.plugins.X`). The access key defaults to the last path
 * segment of the package and is overridable via `alias`. The
 * `permissionNamespace` is always the sanitised package and anchors
 * permission strings.
 */

import type {
    EntryTypeConfig,
    PluginDefinition,
    ResolvedPluginIdentity,
} from '@/types/index.js';

/** `@astromech/redirects` → `astromech-redirects` (lowercase, no `@`, `/`→`-`). */
export function sanitisePackage(pkg: string): string {
    return pkg.toLowerCase().replace(/@/g, '').replace(/\//g, '-');
}

/** Last path segment: `@astromech/redirects` → `redirects`, `redirects` → `redirects`. */
export function derivePluginName(pkg: string): string {
    const segments = pkg.split('/');
    return segments[segments.length - 1] ?? pkg;
}

/** Drizzle table-name prefix for a plugin's own tables: `plugin_{alias}_`. */
export function pluginTablePrefix(alias: string): string {
    return `plugin_${alias}_`;
}

/**
 * Default `schemaModule` specifier for a first-party plugin: the published
 * subpath `astromech/plugins/{alias}/schema`. When a plugin graduates to its
 * own npm package this becomes `{package}/schema` — derive from identity then.
 */
export function pluginSchemaModule(alias: string): string {
    return `astromech/plugins/${alias}/schema`;
}

/**
 * In-tree module-specifier root for a plugin's admin assets (page/field
 * components, locale bundles) — `@/plugins/{alias}`. Mirrors
 * `pluginSchemaModule`: when a plugin graduates to its own package this becomes
 * `{package}`, swapped here in one place rather than at every asset site.
 */
export function pluginAssetRoot(alias: string): string {
    return `@/plugins/${alias}`;
}

/** `redirects` → `Redirects`, `my-plugin` → `My Plugin`. Fallback admin label. */
export function titleCaseAlias(alias: string): string {
    return alias
        .split(/[-_]/)
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

/**
 * Plugin entry types as `[type, config]` pairs. Configs in the `entries` array
 * self-declare their `type`; this validates presence and adapts to the keyed
 * shape the resolver, nav, and storage registry consume.
 */
export function pluginEntryTypes(def: PluginDefinition): [string, EntryTypeConfig][] {
    return (def.entries ?? []).map((cfg) => {
        if (!cfg.type) {
            throw new Error(
                `Astromech plugin "${def.package}" declares an entry type without a "type". ` +
                    `Plugin entry configs must set their own \`type\` key.`
            );
        }
        return [cfg.type, cfg];
    });
}

/** Compute the full identity for a single plugin definition. */
export function resolvePluginIdentity(def: PluginDefinition): ResolvedPluginIdentity {
    const name = def.alias ?? def.name ?? derivePluginName(def.package);
    const identity: ResolvedPluginIdentity = {
        package: def.package,
        name,
        alias: name,
        permissionNamespace: sanitisePackage(def.package),
    };
    if (def.version !== undefined) {
        identity.version = def.version;
    }
    return identity;
}

/**
 * Resolve a plugin-declared permission string: bare keys are plugin-scoped
 * (`'view'` → `plugin:<namespace>:view`); strings containing `:` pass through
 * unchanged so core permissions (`settings:read`) remain expressible.
 */
export function resolvePluginPermission(namespace: string, permission: string): string {
    return permission.includes(':') ? permission : `plugin:${namespace}:${permission}`;
}

/**
 * Throw a build error if two plugins resolve to the same access key. The user
 * resolves collisions by setting `alias` on one of them.
 */
export function assertNoPluginCollisions(
    defs: PluginDefinition[]
): ResolvedPluginIdentity[] {
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
 * dependency must be present, satisfy the declared range (when both versions
 * are known), and appear *before* its dependent in `plugins: []` — execution
 * order is array order, so dependencies must resolve first. No auto-install /
 * negotiation / reordering. Throws a build error on failure.
 */
export function checkPluginDependencies(defs: PluginDefinition[]): void {
    const indexByPackage = new Map<string, number>();
    for (const [index, def] of defs.entries()) {
        indexByPackage.set(def.package, index);
    }

    for (const [index, def] of defs.entries()) {
        for (const [depPackage, range] of Object.entries(def.dependsOn ?? {})) {
            const depIndex = indexByPackage.get(depPackage);
            if (depIndex === undefined) {
                throw new Error(
                    `Astromech plugin "${def.package}" depends on "${depPackage}", which is not installed. ` +
                        `Add it to your \`plugins\` array.`
                );
            }
            const dep = defs[depIndex];
            if (dep === undefined) continue;
            if (dep.version !== undefined && !satisfiesRange(dep.version, range)) {
                throw new Error(
                    `Astromech plugin "${def.package}" requires "${depPackage}@${range}", ` +
                        `but version ${dep.version} is installed.`
                );
            }
            if (depIndex > index) {
                throw new Error(
                    `Astromech plugin "${def.package}" depends on "${depPackage}", which is listed after it ` +
                        `in \`plugins\`. Plugins load in array order — move "${depPackage}" before "${def.package}".`
                );
            }
        }
    }
}
