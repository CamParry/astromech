/**
 * Plugin System Helpers
 *
 * Field injection is explicit attachment now (users compose plugin
 * field-group factories into their own entry-type config), so the old
 * `targets`-based dynamic injection is gone. Plugin entry types no longer
 * flat-merge into root `entries` — they resolve into the namespaced
 * `ResolvedConfig.pluginEntries` (see `config-resolver.ts`). What remains here
 * is collecting email overrides. Identity validation and dependency checks live
 * in `plugin-identity.ts` and are assembled from `config-resolver.ts`.
 */

import type { AstromechConfig } from '@/types/index.js';
import { registerEmailOverride } from '@/email/email-overrides.js';

/**
 * Register plugin email template overrides.
 *
 * @param config - Astromech configuration
 */
export function collectEmailOverrides(config: AstromechConfig): void {
    for (const plugin of config.plugins ?? []) {
        for (const override of plugin.emails ?? []) {
            registerEmailOverride(override);
        }
    }
}
