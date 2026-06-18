/**
 * Shim for virtual:astromech/config
 *
 * The SDK modules (`services/entries/service.ts`, `transport/local/index.ts`) import from
 * `virtual:astromech/config` which is normally injected by the Astro integration
 * at build time. In the CLI context this virtual module does not exist, so we
 * shim it with a live getter that reads from the global registry populated by
 * `loadConfig`.
 *
 * tsup aliases this path to here for the CLI build only.
 */

import type { ResolvedConfig } from '@/types/index.js';

declare global {
    var __astromechCliConfig: ResolvedConfig | undefined;
}

export function setCliConfig(config: ResolvedConfig): void {
    globalThis.__astromechCliConfig = config;
}

function getCliConfig(): ResolvedConfig {
    if (!globalThis.__astromechCliConfig) {
        throw new Error(
            '[Astromech CLI] Config not loaded. Ensure loadConfig() has been called.'
        );
    }
    return globalThis.__astromechCliConfig;
}

// Export as a Proxy so property accesses are always forwarded to the live config.
// This matches the shape of ResolvedConfig used by the SDK (entries, defaultLocale, etc.)
const configProxy = new Proxy({} as ResolvedConfig, {
    get(_target, prop: string) {
        return (getCliConfig() as Record<string, unknown>)[prop];
    },
    set(_target, prop: string, value: unknown) {
        (getCliConfig() as Record<string, unknown>)[prop] = value;
        return true;
    },
});

export default configProxy;
