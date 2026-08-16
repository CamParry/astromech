/**
 * Enumeration guard shared by the passes that walk every entry source.
 *
 * An unregistered plugin runtime resolves a table-backed plugin entry type to
 * the built-in storage, so its rows read as zero sources — silently, which is
 * the worst outcome for both a rebuild and a report.
 */

import config from 'virtual:astromech/config';
import { getPluginIdentities } from '@/plugins/runtime/plugin-runtime';

/**
 * Refuse a run that cannot see every plugin source. `consequence` names what
 * the caller would get wrong, so the message reads as one sentence.
 */
export function assertPluginSourcesReachable(consequence: string): void {
    const plugins = Object.keys(config.pluginEntries);
    if (plugins.length === 0 || getPluginIdentities().length > 0) return;
    throw new Error(
        `Cannot enumerate entry sources: the config contributes entry types from ${plugins.join(', ')} but the plugin runtime is not registered, so those sources would read as empty and ${consequence}. ` +
            'Call wireEntryAccess() and registerPlugins(config.plugins ?? [], resolvedConfig) first, as the CLI does.'
    );
}
