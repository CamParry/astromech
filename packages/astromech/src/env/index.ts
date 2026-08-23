/**
 * Cross-runtime environment reads. A platform integration supplies its own
 * source through `setEnvSource`; otherwise values come from the ambient
 * `import.meta.env` and `process.env`.
 */

import { AstromechError } from '@/errors/astromech-error';
import { createRegistry } from '@/registry';

/**
 * A flat map of environment values. Typed `unknown` because Cloudflare puts
 * string vars and object bindings in the same object.
 */
export type EnvSource = Record<string, unknown>;

const envSource = createRegistry<EnvSource>('envSource', { required: false });

/**
 * Declare where environment values come from. A platform integration calls
 * this as it receives the host's environment.
 */
export function setEnvSource(source: EnvSource): void {
    envSource.set(source);
}

/** The registered source, or `undefined`. For binding lookups, which want objects. */
export function resolveEnvSource(): EnvSource | undefined {
    return envSource.get() ?? undefined;
}

/** @internal Test-only. Drops the registered source. */
export function clearEnvSource(): void {
    envSource.clear();
}

/** True inside a Cloudflare Worker isolate, by the user agent the runtime sets. */
export function isWorkersRuntime(): boolean {
    return (
        typeof globalThis.navigator !== 'undefined' &&
        globalThis.navigator.userAgent === 'Cloudflare-Workers'
    );
}

/** An environment value, or `undefined` when nothing supplies it. */
export function resolveEnv(name: string): string | undefined {
    for (const source of sources()) {
        const value = source[name];
        // Vite puts booleans on `import.meta.env` and Cloudflare puts bindings
        // beside its vars, so a non-string counts as absent here.
        if (typeof value === 'string' && value !== '') return value;
    }
    return undefined;
}

/**
 * An environment value. Throws naming the variable when nothing supplies it,
 * for values a caller cannot invent a default for.
 */
export function getEnv(name: string): string {
    const value = resolveEnv(name);
    if (value === undefined) {
        throw new AstromechError(
            `Environment variable '${name}' is not set. On Cloudflare it comes from ` +
                'the `vars` section of your wrangler config, elsewhere from the process environment.'
        );
    }
    return value;
}

/**
 * Every string value as one record, for the plugin `ctx`. Built per call so a
 * plugin never holds a copy taken before the platform registered its source.
 */
export function getEnvRecord(): Record<string, string> {
    const merged: Record<string, string> = {};
    for (const source of [...sources()].reverse()) {
        for (const [key, value] of Object.entries(source)) {
            if (typeof value === 'string') merged[key] = value;
        }
    }
    return merged;
}

/** The sources in precedence order: the platform's, then Vite's, then Node's. */
function sources(): EnvSource[] {
    const found: EnvSource[] = [];

    const platform = envSource.get();
    if (platform !== null) found.push(platform);

    try {
        // Populated by Vite in Astro SSR; absent in plain Node.
        const fromImportMeta = (import.meta as { env?: EnvSource }).env;
        if (fromImportMeta !== undefined) found.push(fromImportMeta);
    } catch {
        // `import.meta` is unavailable in some CommonJS loaders.
    }

    if (typeof process !== 'undefined' && process.env !== undefined) {
        found.push(process.env);
    }

    return found;
}
