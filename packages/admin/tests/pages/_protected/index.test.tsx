/**
 * @vitest-environment happy-dom
 *
 * The dashboard: a card per site entry type the signed-in user may read, its
 * count from one request for every card, and the recent entries of those types.
 */

import type { Entry, QueryResult } from '@/types/index';
import type { ComponentType } from 'react';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Route } from '@/admin/pages/_protected/index';
import { renderAdmin } from '../../_support/render-admin';

const { entriesQuery, entriesCount } = vi.hoisted(() => ({
    entriesQuery: vi.fn(),
    entriesCount: vi.fn(),
}));

vi.mock('astromech/fetch', async (importOriginal) => {
    const real = await importOriginal<{ astromechUntypedClient: object }>();
    return {
        ...real,
        astromechUntypedClient: {
            ...real.astromechUntypedClient,
            entries: { query: entriesQuery, count: entriesCount },
        },
    };
});

// The shim's config plus a second site entry type.
vi.mock('virtual:astromech/admin-config', async (importOriginal) => {
    const real = await importOriginal<{
        default: { entryTypes: Record<string, object> };
    }>();
    return {
        default: {
            ...real.default,
            entryTypes: {
                ...real.default.entryTypes,
                page: { single: 'Page', plural: 'Pages' },
            },
        },
    };
});

const Dashboard = Route.options.component as ComponentType;

function emptyPage(): QueryResult<Entry> {
    return { data: [], pagination: { page: 1, pages: 1, total: 0, limit: 5 } };
}

beforeEach(() => {
    entriesQuery.mockReset();
    entriesCount.mockReset();
    entriesQuery.mockResolvedValue(emptyPage());
    entriesCount.mockImplementation(({ type }: { type: string[] }) =>
        Promise.resolve(Object.fromEntries(type.map((one) => [one, 7])))
    );
});

describe('the dashboard', () => {
    it('shows a card only for the types the user may read, counted in one request', async () => {
        renderAdmin(<Dashboard />, {
            permissions: ['admin:access', 'entry:read:full', 'entry:post:read'],
        });

        expect(await screen.findByText('7')).toBeTruthy();
        expect(screen.getByText('Posts')).toBeTruthy();
        expect(screen.queryByText('Pages')).toBeNull();
        expect(entriesCount).toHaveBeenCalledTimes(1);
        expect(entriesCount).toHaveBeenCalledWith({ type: ['post'] });
        expect(entriesQuery.mock.calls.map(([params]) => params.type)).toEqual(['post']);
    });

    it('counts every readable type in the same request', async () => {
        renderAdmin(<Dashboard />);

        expect(await screen.findAllByText('7')).toHaveLength(2);
        expect(screen.getByText('Pages')).toBeTruthy();
        expect(entriesCount).toHaveBeenCalledTimes(1);
        expect(entriesCount).toHaveBeenCalledWith({ type: ['post', 'page'] });
    });
});
