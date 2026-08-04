/**
 * Table descriptor for the authoring plugin's chat sessions. `definePluginTable`
 * owns the `plugin_<namespace>_` prefix, so the table is declared with its bare
 * name and comes out as `plugin_authoring_sessions`.
 */

import { definePluginTable } from 'astromech';
import type { TableInsert, TableSelect } from 'astromech';
import { AUTHORING_PACKAGE } from '../types.js';
import type { ChatMessage } from '../types.js';

export const sessionsTable = definePluginTable(
    AUTHORING_PACKAGE,
    'sessions',
    ({ col }) => ({
        id: col.id(),
        /** Unique: a user has one conversation, replaced rather than archived. */
        userId: col.text({ notNull: true, unique: true }),
        /** The transcript as content blocks, in the shape the drawer posts back. */
        messages: col.json<ChatMessage[]>({ notNull: true }),
        createdAt: col.timestamp({ notNull: true, defaultNow: true }),
        updatedAt: col.timestamp({ notNull: true, defaultNow: true, onUpdate: true }),
    })
);

export type SessionRow = TableSelect<typeof sessionsTable>;
export type NewSessionRow = TableInsert<typeof sessionsTable>;
