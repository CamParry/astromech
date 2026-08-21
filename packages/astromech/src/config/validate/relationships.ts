/**
 * Boot-time validation that every qualified relationship target resolves.
 */

import type { Field, ResolvedEntryFields } from '@/types/fields';
import type { ResolvedConfig } from '@/types/index';
import { parseEntryTypeId, resolveEntryType } from '@/entries/entry-types.shared';

/**
 * Any relationship field whose `target` is qualified (`{plugin}/{type}`) must
 * resolve against the fully-built `{entries, pluginEntries}`. Bare targets
 * are not checked here. Crashes loud, naming the entry type, field, target.
 */
export function assertQualifiedRelationshipTargets(
    config: Pick<ResolvedConfig, 'entries' | 'pluginEntries'>
): void {
    const checkNodes = (ownerKey: string, nodes: Field[]): void => {
        for (const field of nodes) {
            if (field.type === 'relationship') {
                const target = field.target;
                if (target && parseEntryTypeId(target)) {
                    if (resolveEntryType(config, target) === undefined) {
                        throw new Error(
                            `Astromech entry type "${ownerKey}": relationship field ` +
                                `"${field.name}" targets unknown entry type "${target}".`
                        );
                    }
                }
            }
            if (field.fields) checkNodes(ownerKey, field.fields);
        }
    };
    const check = (ownerKey: string, fields: ResolvedEntryFields): void => {
        checkNodes(ownerKey, fields.main);
        checkNodes(ownerKey, fields.sidebar);
    };

    for (const [typeKey, entryType] of Object.entries(config.entries)) {
        check(typeKey, entryType.fields);
    }
    for (const [plugin, types] of Object.entries(config.pluginEntries)) {
        for (const [type, entryType] of Object.entries(types)) {
            check(`${plugin}/${type}`, entryType.fields);
        }
    }
}
