/**
 * Plugin System Helpers
 *
 * Field injection is explicit attachment now (users compose plugin
 * field-group factories into their own entry-type config), so the old
 * `targets`-based dynamic injection is gone. What remains is merging
 * plugin-contributed entry types into the config and collecting email
 * overrides. Identity validation and dependency checks live in
 * `plugin-identity.ts` and are orchestrated from `config-resolver.ts`.
 */

import type { AstromechConfig } from '@/types/index.js';
import { registerEmailOverride } from '@/email/email-overrides.js';

/**
 * Merge plugin-contributed entry types into the config. Plugin entry types are
 * first-class — they live flat at `/admin/entries/{type}` like user types.
 *
 * @param config - Astromech configuration
 */
export function mergePluginEntries(config: AstromechConfig): void {
	for (const plugin of config.plugins ?? []) {
		if (plugin.entries) {
			Object.assign(config.entries, plugin.entries);
		}
	}
}

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
