/**
 * Boot-time validation that every relationship target an entry type declares
 * resolves.
 */

import type { Field, ResolvedEntryFields } from '@/types/fields';
import type { ResolvedEntryType } from '@/types/index';
import { getFieldType } from '@/fields/field-type-registry';
import { fieldAffectsData } from '@/fields/flatten';
import { traverseFields } from '@/fields/traverse';

/** Targets that are resources rather than entry types. */
const RESOURCE_TARGETS = new Set(['users', 'media']);

/**
 * Every relationship field's `target` must be `users`, `media` or a declared
 * entry type id, the site's or a plugin's. Crashes loud, naming the entry type,
 * field and target.
 */
export function assertRelationshipTargets(
    entryTypes: Record<string, ResolvedEntryType>
): void {
    const checkNodes = (owner: string, nodes: Field[]): void => {
        traverseFields(nodes, ({ field }) => {
            const target = fieldAffectsData(field) ? field.target : undefined;
            if (target === undefined || getFieldType(field.type)?.isRelation !== true) {
                return;
            }
            if (!RESOURCE_TARGETS.has(target) && !Object.hasOwn(entryTypes, target)) {
                throw new Error(
                    `Astromech entry type "${owner}": relationship field ` +
                        `"${field.name}" targets unknown entry type "${target}".`
                );
            }
        });
    };
    const check = (owner: string, fields: ResolvedEntryFields): void => {
        checkNodes(owner, fields.main);
        checkNodes(owner, fields.sidebar);
    };

    for (const [id, entryType] of Object.entries(entryTypes)) {
        check(id, entryType.fields);
    }
}
