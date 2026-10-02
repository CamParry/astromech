/**
 * Icons named in config (an entry type's, a global's, a nav item's), looked
 * up in the set `virtual:astromech/admin-icons` bundles.
 */

import type { LucideIcon } from 'lucide-react';
import adminIcons from 'virtual:astromech/admin-icons';

/** A configured icon name as its Lucide component, or `fallback` when unset or unknown. */
export function resolveIcon(name: string | undefined, fallback: LucideIcon): LucideIcon {
    if (name === undefined) return fallback;
    return adminIcons[name] ?? fallback;
}
