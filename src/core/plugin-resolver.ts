/**
 * Plugin System Helpers
 * Handles plugin target resolution and merging into config
 */

import type { AstromechConfig, PluginTargets } from '@/types/index.js';
import { registerEmailOverride } from '@/email/email-overrides.js';

/**
 * Resolve plugin targets to an array of collection names
 *
 * @param targets - Plugin target specification (string array, wildcard, or object)
 * @param collectionNames - Available collection names
 * @param systemResources - System resource names (media, users)
 * @returns Resolved array of target names
 */
export function resolveTargets(
	targets: PluginTargets,
	collectionNames: string[],
	systemResources: string[] = ['media', 'users']
): string[] {
	const allTargets = [...collectionNames, ...systemResources];

	// Wildcard: target everything
	if (targets === '*') {
		return allTargets;
	}

	// Array: target specific collections
	if (Array.isArray(targets)) {
		return targets.filter((t) => allTargets.includes(t));
	}

	// Object: include/exclude pattern
	let result = targets.include ?? allTargets;
	if (targets.exclude) {
		result = result.filter((t) => !targets.exclude?.includes(t));
	}
	return result;
}

/**
 * Merge plugin field groups into target entry types and system resources
 *
 * @param config - Astromech configuration
 * @param entryTypeNames - Available entry type names
 */
export function mergePluginFieldGroups(config: AstromechConfig, entryTypeNames: string[]): void {
	for (const plugin of config.plugins ?? []) {
		for (const fieldGroupEntry of plugin.fieldGroups ?? []) {
			const targetNames = resolveTargets(fieldGroupEntry.targets, entryTypeNames);

			for (const targetName of targetNames) {
				// Handle media resource
				if (targetName === 'media') {
					config.media = config.media ?? { fieldGroups: [] };
					config.media.fieldGroups = config.media.fieldGroups ?? [];
					config.media.fieldGroups.push(...fieldGroupEntry.groups);
					continue;
				}

				// Handle users resource
				if (targetName === 'users') {
					config.users = config.users ?? { fieldGroups: [] };
					config.users.fieldGroups = config.users.fieldGroups ?? [];
					config.users.fieldGroups.push(...fieldGroupEntry.groups);
					continue;
				}

				// Handle entry types
				const entryType = config.entries[targetName];
				if (entryType) {
					entryType.fieldGroups.push(...fieldGroupEntry.groups);
				}
			}
		}
	}
}

/**
 * Merge plugin entry types into config
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
 * Register plugin email template overrides
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
