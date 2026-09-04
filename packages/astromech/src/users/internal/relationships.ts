/**
 * Relationship indexing (users policy): derive a user's edges from every
 * locale's stored content and replace its rows in the index, plus the
 * rebuild-side collector that enumerates every user as a source. Mirrors
 * `media/internal/relationships.ts`.
 */

import type { RelationshipIndexSource } from '@/database/repository/relationships';
import type { RelationshipEdge } from '@/fields/relationship-edges';
import type { JsonObject } from '@/types/index';
import { getConfig } from '@/config/registry';
import { createRepository } from '@/database/repository/create-repository';
import { createRelationshipRepository } from '@/database/repository/relationships';
import { userContentTable, usersTable } from '@/database/tables';
import { flattenFieldNodes } from '@/fields/flatten';
import { collectRelationshipEdges } from '@/fields/relationship-edges';

/**
 * Re-index one user. The index is keyed on the user, so every locale it holds
 * contributes: a write to one locale re-reads the rest rather than replacing
 * their edges with its own. Call it inside the transaction that wrote the
 * row, after that write, so the re-read sees it.
 */
export async function indexUserRelationships(id: string): Promise<void> {
    const rows = await createRepository(userContentTable).findMany({
        where: { userId: id },
    });
    await createRelationshipRepository().replaceForSource(
        { id, kind: 'user' },
        userContentEdges(rows)
    );
}

/**
 * Every user as a relationship source, with the edges its STORED content holds
 * across all locales. The rebuild side of `indexUserRelationships`, read
 * straight from the tables rather than through `repository.list()`, whose join
 * is pinned to the default locale. Stored data has already been through
 * `parseFields`, so the traversal mints no ids here.
 */
export async function collectUserRelationshipSources(): Promise<
    RelationshipIndexSource[]
> {
    const users = await createRepository(usersTable).findMany({});
    const contents = await createRepository(userContentTable).findMany({});

    const rowsByUser = new Map<string, typeof contents>();
    for (const row of contents) {
        const held = rowsByUser.get(row.userId);
        if (held) held.push(row);
        else rowsByUser.set(row.userId, [row]);
    }

    return users.map((user) => ({
        source: { id: user.id, kind: 'user' as const },
        edges: userContentEdges(rowsByUser.get(user.id) ?? []),
    }));
}

/**
 * One edge per (instancePath, target) across a user's content rows: two
 * locales holding the same reference are one row, and the index's primary key
 * would reject the second. Users have no staging, so every edge is canonical.
 *
 * The one place the rule lives — the write seam and the rebuild both call it.
 */
function userContentEdges(rows: readonly { fields: unknown }[]): RelationshipEdge[] {
    const definitions = flattenFieldNodes(getConfig().users.fields);
    const byKey = new Map<string, RelationshipEdge>();
    for (const row of rows) {
        const fields = (row.fields ?? {}) as JsonObject;
        for (const edge of collectRelationshipEdges(definitions, fields)) {
            byKey.set(`${edge.instancePath}\0${edge.targetKind}\0${edge.targetId}`, edge);
        }
    }
    return Array.from(byKey.values());
}
