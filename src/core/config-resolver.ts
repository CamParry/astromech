/**
 * Configuration Resolution
 * Processes and resolves Astromech configuration with defaults
 */

import type { AstromechConfig, FieldGroup, ResolvedConfig } from '@/types/index.js';
import { mergePluginEntries } from '@/core/plugin-resolver.js';
import { assertNoPluginCollisions, checkPluginDependencies } from '@/core/plugin-identity.js';

/**
 * Sort field groups by priority within each collection and resource
 *
 * Lower priority numbers appear first.
 *
 * @param config - Astromech configuration
 */
export function sortFieldGroups(config: AstromechConfig): void {
	const sortGroups = (groups: FieldGroup[]): void => {
		groups.sort((a, b) => (a.priority ?? 10) - (b.priority ?? 10));
	};

	// Sort entry type field groups
	for (const entryType of Object.values(config.entries)) {
		sortGroups(entryType.fieldGroups);
	}

	// Sort media field groups
	if (config.media?.fieldGroups) {
		sortGroups(config.media.fieldGroups);
	}

	// Sort users field groups
	if (config.users?.fieldGroups) {
		sortGroups(config.users.fieldGroups);
	}
}

/**
 * Resolve the config with defaults and plugin merging
 *
 * @param config - User-provided Astromech configuration
 * @returns Fully resolved configuration with defaults
 */
export function resolveConfig(config: AstromechConfig): ResolvedConfig {
	// Step 1: Validate plugin identities (access-key collisions) and
	// dependencies (existence + basic semver range). Both crash loud.
	const plugins = config.plugins ?? [];
	assertNoPluginCollisions(plugins);
	checkPluginDependencies(plugins);

	// Step 2: Merge plugin-contributed entry types into the config.
	mergePluginEntries(config);

	// Step 3: Sort field groups by priority
	sortFieldGroups(config);

	// Step 4: Return resolved config with defaults
	// Destructure out `db` so the driver instance is not included in the
	// resolved config (it cannot be JSON.stringify'd into the virtual module).
	const { db: _db, ...rest } = config;
	return {
		...rest,
		adminRoute: config.adminRoute ?? '/admin',
		apiRoute: config.apiRoute ?? '/api',
		trash: {
			enabled: config.trash?.enabled ?? true,
			retentionDays: config.trash?.retentionDays ?? 30,
		},
	};
}
