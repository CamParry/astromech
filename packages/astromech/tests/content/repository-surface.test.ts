/**
 * The resource repositories share one read vocabulary (`DECISIONS.md`,
 * "Repository methods take Prisma's and TypeORM's verbs"). This pins the names,
 * so a rename in one resource cannot drift from the others.
 */

import { describe, expect, it } from 'vitest';
import { getEntriesTableRepository } from '@/entries/repository/registry';
import { getGlobalRepository } from '@/globals/repository';
import { getMediaRepository } from '@/media/repository';
import { getUserRepository } from '@/users/repository';

const lists = {
    user: getUserRepository,
    media: getMediaRepository,
    entries: getEntriesTableRepository,
};
const repositories = { ...lists, global: getGlobalRepository };

describe('resource repository surface', () => {
    it.each(Object.entries(repositories))('%s exposes findOne', (_, get) => {
        expect(get()).toHaveProperty('findOne', expect.any(Function));
    });

    it.each(Object.entries(lists))('%s exposes the list reads', (_, get) => {
        for (const name of ['findMany', 'count', 'findAnyLocale']) {
            expect(get()).toHaveProperty(name, expect.any(Function));
        }
    });

    it.each(Object.entries(repositories))('%s exposes no retired name', (_, get) => {
        for (const name of ['get', 'list', 'anyLocale', 'owners']) {
            expect(get()).not.toHaveProperty(name);
        }
    });
});
