/**
 * Plugin identity derivation and validation.
 *
 * `package` is the single canonical identifier a plugin declares. Every other
 * representation — table prefix, permission namespace, i18n namespace, HTTP
 * route segment, service key — derives from it mechanically. There is no
 * declared name, no alias, and no site-level override: a plugin's physical
 * table names are baked into its shipped migration SQL, so nothing an
 * override could move at boot actually moves.
 *
 * Derivation runs ONE direction — `package` → `namespace` → `serviceKey` — and
 * no consumer inverts it. Both steps are lossy, so an inverse would be a guess;
 * code that needs another form of an identifier resolves the identity once and
 * reads the field it wants. Anything that re-derives a string backwards from a
 * route segment or a property key is a bug.
 *
 * npm is the uniqueness authority for `package`; the lossy steps below it are
 * policed by {@link assertNoPluginCollisions}.
 */

import {
    pluginNamespace,
    pluginServiceKey,
    type PluginNamespace,
} from '@/utilities/plugin-namespace.js';
import type {
    EntryTypeConfig,
    PluginDefinition,
    ResolvedPluginIdentity,
} from '@/types/index.js';

/**
 * The derivation itself lives in a pure leaf: `database/define-plugin-table`
 * needs the same string — and the same literal type — to build a plugin's
 * table prefix, and the database capability may not import the plugin runtime.
 * Re-exported here because this module is the plugin-identity surface every
 * other consumer (and `astromech/plugin-kit`) imports from.
 */
export { pluginNamespace, pluginServiceKey };
export type { PluginNamespace };

/** Table-name prefix for a plugin's own tables: `plugin_{namespace}_`. */
export function pluginTablePrefix(namespace: string): string {
    return `plugin_${namespace}_`;
}

/**
 * In-tree module-specifier root for a plugin's admin assets (page/field
 * components, locale bundles) — `@/plugins/{namespace}`. When a plugin
 * graduates to its own package this becomes `{package}`, swapped here in one
 * place rather than at every asset site.
 */
export function pluginAssetRoot(namespace: string): string {
    return `@/plugins/${namespace}`;
}

/** `redirects` → `Redirects`, `acme_seo` → `Acme Seo`. Fallback admin label. */
export function titleCaseNamespace(namespace: string): string {
    return namespace
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
    const namespace = pluginNamespace(def.package);
    const identity: ResolvedPluginIdentity = {
        package: def.package,
        namespace,
        serviceKey: pluginServiceKey(namespace),
        permissionNamespace: namespace,
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
 * Throw a build error if two plugins collide on either derived identifier.
 *
 * Both derivation steps are lossy, and each has its own collision:
 *   - `package` → `namespace` — `@acme/seo` and unscoped `acme-seo` both give
 *     `acme_seo`, which would share a table prefix and a permission namespace.
 *   - `namespace` → `serviceKey` — `acme_2fa` and `acme2fa` both give `acme2fa`,
 *     which would share an `Astromech.plugins.*` key and an HTTP route segment.
 *
 * The second check is what makes `serviceKey` safe to treat as a unique lookup
 * key everywhere else, so nothing has to invert the derivation to find a plugin.
 *
 * There is no override for either: the identifiers derive from the package
 * name, so this is the plugin authors' problem to resolve by renaming a
 * package, not the site's.
 */
export function assertNoPluginCollisions(
    defs: PluginDefinition[]
): ResolvedPluginIdentity[] {
    const identities = defs.map(resolvePluginIdentity);
    const byNamespace = new Map<string, string>();
    const byServiceKey = new Map<string, string>();

    for (const id of identities) {
        const sameNamespace = byNamespace.get(id.namespace);
        if (sameNamespace !== undefined) {
            throw new Error(
                `Astromech plugin namespace collision: "${sameNamespace}" and "${id.package}" both ` +
                    `derive the namespace "${id.namespace}", so they would share a table prefix ` +
                    `and a permission namespace. A namespace is derived from the package name and ` +
                    `cannot be overridden — one of the two packages has to be renamed by its author.`
            );
        }
        byNamespace.set(id.namespace, id.package);

        const sameServiceKey = byServiceKey.get(id.serviceKey);
        if (sameServiceKey !== undefined) {
            throw new Error(
                `Astromech plugin service key collision: "${sameServiceKey}" and "${id.package}" both ` +
                    `derive the service key "${id.serviceKey}", so they would share an ` +
                    `\`Astromech.plugins.${id.serviceKey}\` property and an HTTP route segment. ` +
                    `A service key is derived from the package name and cannot be overridden — ` +
                    `one of the two packages has to be renamed by its author.`
            );
        }
        byServiceKey.set(id.serviceKey, id.package);
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
