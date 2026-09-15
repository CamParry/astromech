import { Database } from 'lucide-react';
import adminIcons from 'virtual:astromech/admin-icons';

/**
 * Render an entry type's configured Lucide icon by name, falling back to a
 * database icon when unset or unknown. Shared by the sidebar and the topbar
 * quick-create menu so the two never drift.
 */
export function EntryTypeIcon({
    name,
    size = 16,
}: {
    name?: string | undefined;
    size?: number;
}) {
    const Icon = name !== undefined ? (adminIcons[name] ?? Database) : Database;
    return <Icon size={size} />;
}
