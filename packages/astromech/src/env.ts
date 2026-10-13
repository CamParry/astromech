/**
 * Cross-runtime environment reads. A platform integration supplies its own
 * source through `setEnvSource`, and the Astro middleware supplies Vite's under
 * `astro dev` through `setViteEnvSource`; otherwise values come from
 * `process.env`.
 */

import { createRegistry } from '@/registry';

/**
 * A flat map of environment values. Typed `unknown` because Cloudflare puts
 * string vars and object bindings in the same object.
 */
export type EnvSource = Record<string, unknown>;

const envSource = createRegistry<EnvSource>('envSource', { required: false });

const viteEnvSource = createRegistry<EnvSource>('viteEnvSource', { required: false });

/**
 * Declare where environment values come from. A platform integration calls
 * this as it receives the host's environment.
 */
export function setEnvSource(source: EnvSource): void {
    envSource.set(source);
}

/**
 * Declare Vite's `import.meta.env` under `astro dev`, which is where Astro puts
 * the values in the site's `.env` files. Core never reads `import.meta.env`
 * itself: in a build, Astro would inline into the bundle every build-machine
 * variable whose name appears in the module that reads it.
 */
export function setViteEnvSource(source: EnvSource): void {
    viteEnvSource.set(source);
}

/** The registered source, or `undefined`. For binding lookups, which want objects. */
export function resolveEnvSource(): EnvSource | undefined {
    return envSource.get() ?? undefined;
}

/** @internal Test-only. Drops the registered sources. */
export function clearEnvSource(): void {
    envSource.clear();
    viteEnvSource.clear();
}

/** True inside a Cloudflare Worker isolate, by the user agent the runtime sets. */
export function isWorkersRuntime(): boolean {
    return (
        typeof globalThis.navigator !== 'undefined' &&
        globalThis.navigator.userAgent === 'Cloudflare-Workers'
    );
}

/**
 * The mode `NODE_ENV` names. Anything but `development` or `test`, unset
 * included, is production, because a Worker sets no `NODE_ENV`.
 */
export function resolveNodeEnv(): 'development' | 'test' | 'production' {
    const value = resolveEnv('NODE_ENV');
    return value === 'development' || value === 'test' ? value : 'production';
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

    const vite = viteEnvSource.get();
    if (vite !== null) found.push(vite);

    if (typeof process !== 'undefined' && process.env !== undefined) {
        found.push(process.env);
    }

    return found;
}
