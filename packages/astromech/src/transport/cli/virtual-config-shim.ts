/**
 * Shim for virtual:astromech/config
 *
 * The local-transport modules (`services/entries/service.ts`, `transport/local/index.ts`)
 * import from `virtual:astromech/config` which is normally injected by the Astro
 * integration at build time. In the CLI context this virtual module does not
 * exist, so we shim it with a live getter that reads from the global registry
 * populated by `loadConfig`.
 *
 * tsup aliases this path to here for the CLI build only.
 */

import type { AstromechConfig, ResolvedConfig } from '@/types/index';
import { globals } from '@/utilities/registry';

export function setCliConfig(config: ResolvedConfig): void {
    globals().cliConfig = config;
}

function getCliConfig(): ResolvedConfig {
    const config = globals().cliConfig;
    if (config === undefined) {
        throw new Error(
            '[Astromech CLI] Config not loaded. Ensure loadConfig() has been called.'
        );
    }
    return config as ResolvedConfig;
}

// Export as a Proxy so property accesses are always forwarded to the live config.
// This matches the shape of ResolvedConfig used by the local transport (entries, defaultLocale, etc.)
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

// The live virtual module also exports the author's config as written. The CLI
// only ever holds the resolved one, so this exists to match the module's shape
// and throws rather than passing a resolved config off as a raw one.
export const rawConfig = new Proxy({} as AstromechConfig, {
    get(_target, prop: string) {
        throw new Error(
            `[Astromech CLI] The raw config is not available here (read '${prop}').`
        );
    },
});
