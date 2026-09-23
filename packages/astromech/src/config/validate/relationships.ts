/**
 * Boot-time validation that every qualified relationship target resolves.
 */

import type { Field, ResolvedEntryFields } from '@/types/fields';
import type { ResolvedConfig } from '@/types/index';
import { parseEntryTypeId, resolveEntryType } from '@/entries/entry-types';
import { getFieldType } from '@/fields/field-type-registry';
import { fieldAffectsData } from '@/fields/flatten';
import { traverseFields } from '@/fields/traverse';

/**
 * Any relationship field whose `target` is qualified (`{plugin}/{type}`) must
 * resolve against the fully-built `{entries, pluginEntries}`. Bare targets
 * are not checked here. Crashes loud, naming the entry type, field, target.
 */
export function assertQualifiedRelationshipTargets(
    config: Pick<ResolvedConfig, 'entries' | 'pluginEntries'>
): void {
    const checkNodes = (ownerKey: string, nodes: Field[]): void => {
        traverseFields(nodes, ({ field }) => {
            const target = fieldAffectsData(field) ? field.target : undefined;
            if (target === undefined || getFieldType(field.type)?.isRelation !== true) {
                return;
            }
            if (
                parseEntryTypeId(target) &&
                resolveEntryType(config, target) === undefined
            ) {
                throw new Error(
                    `Astromech entry type "${ownerKey}": relationship field ` +
                        `"${field.name}" targets unknown entry type "${target}".`
                );
            }
        });
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
