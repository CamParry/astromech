/**
 * Configuration Resolution
 * Processes and resolves Astromech configuration with defaults
 */

import type { AstromechConfig, FieldGroup, ResolvedConfig } from '@/types/index.js';
import { mergePluginCollections, mergePluginFieldGroups } from '@/core/plugin-resolver.js';

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

	// Sort collection field groups
	for (const collection of Object.values(config.collections)) {
		sortGroups(collection.fieldGroups);
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
	// Step 1: Merge plugin collections (they might be targets for field groups)
	mergePluginCollections(config);

	// Step 2: Get updated collection names after plugin collections are added
	const allCollectionNames = Object.keys(config.collections);

	// Step 3: Merge plugin field groups into collections
	mergePluginFieldGroups(config, allCollectionNames);

	// Step 4: Sort field groups by priority
	sortFieldGroups(config);

	// Step 5: Return resolved config with defaults
	// Destructure out `db` so the driver instance is not included in the
	// resolved config (it cannot be JSON.stringify'd into the virtual module).
	const { db: _db, ...rest } = config;
	return {
		...rest,
		adminRoute: config.adminRoute ?? '/admin',
		apiRoute: config.apiRoute ?? '/api/cms',
		trash: {
			enabled: config.trash?.enabled ?? true,
			retentionDays: config.trash?.retentionDays ?? 30,
		},
	};
}
