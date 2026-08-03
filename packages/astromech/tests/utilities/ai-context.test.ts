import { describe, expect, it } from 'vitest';
import type { AIContextEntry } from '@/utilities/ai-context.js';
import { formatAIContextMessage } from '@/utilities/ai-context.js';

/** Build a single-reference list so a line can be asserted in isolation. */
function lineFor(reference: AIContextEntry['reference']): string {
    const message = formatAIContextMessage([{ reference, depth: 0, order: 0 }]);
    return (message?.content.split('\n')[1] ?? '').replace('1. ', '');
}

describe('formatAIContextMessage', () => {
    describe('empty input', () => {
        it('returns null', () => {
            expect(formatAIContextMessage([])).toBeNull();
        });
    });

    describe('ordering', () => {
        it('sorts by depth ascending', () => {
            const message = formatAIContextMessage([
                { reference: { kind: 'pages', label: 'Deep' }, depth: 2, order: 0 },
                { reference: { kind: 'pages', label: 'Shallow' }, depth: 0, order: 0 },
                { reference: { kind: 'pages', label: 'Middle' }, depth: 1, order: 0 },
            ]);
            expect(message?.content).toContain('1. Admin page `Shallow`');
            expect(message?.content).toContain('2. Admin page `Middle`');
            expect(message?.content).toContain('3. Admin page `Deep`');
        });

        it('breaks depth ties by order ascending', () => {
            const message = formatAIContextMessage([
                { reference: { kind: 'pages', label: 'Third' }, depth: 1, order: 9 },
                { reference: { kind: 'pages', label: 'First' }, depth: 1, order: 1 },
                { reference: { kind: 'pages', label: 'Second' }, depth: 1, order: 4 },
            ]);
            expect(message?.content).toContain('1. Admin page `First`');
            expect(message?.content).toContain('2. Admin page `Second`');
            expect(message?.content).toContain('3. Admin page `Third`');
        });

        it('does not mutate the input array', () => {
            const entries: AIContextEntry[] = [
                { reference: { kind: 'pages', label: 'B' }, depth: 2, order: 0 },
                { reference: { kind: 'pages', label: 'A' }, depth: 0, order: 0 },
            ];
            formatAIContextMessage(entries);
            expect(entries.map((entry) => entry.reference.label)).toEqual(['B', 'A']);
        });
    });

    describe('entries', () => {
        it('renders a single entry with type and id', () => {
            expect(
                lineFor({ kind: 'entries', type: 'posts', id: 'abc', label: 'Hello' })
            ).toBe('Entry `Hello` (type `posts`, id `abc`)');
        });

        it('renders a list when there is no id', () => {
            expect(lineFor({ kind: 'entries', type: 'posts', label: 'Posts' })).toBe(
                'Entry list for type `posts` (`Posts`)'
            );
        });

        it('keeps a qualified entry type verbatim', () => {
            expect(
                lineFor({
                    kind: 'entries',
                    type: 'redirects/redirect',
                    id: 'r1',
                    label: 'Old URL',
                })
            ).toBe('Entry `Old URL` (type `redirects/redirect`, id `r1`)');
        });
    });

    describe('media', () => {
        it('renders a single item with id', () => {
            expect(lineFor({ kind: 'media', id: 'm1', label: 'logo.png' })).toBe(
                'Media item `logo.png` (id `m1`)'
            );
        });

        it('renders the library without an id', () => {
            expect(lineFor({ kind: 'media', label: 'Media' })).toBe(
                'Media library (`Media`)'
            );
        });
    });

    describe('users', () => {
        it('renders a single user with id', () => {
            expect(lineFor({ kind: 'users', id: 'u1', label: 'Ada' })).toBe(
                'User `Ada` (id `u1`)'
            );
        });

        it('renders the list without an id', () => {
            expect(lineFor({ kind: 'users', label: 'Users' })).toBe(
                'User list (`Users`)'
            );
        });
    });

    describe('settings', () => {
        it('appends the id when present', () => {
            expect(lineFor({ kind: 'settings', id: 'site', label: 'Site' })).toBe(
                'Settings screen `Site` (id `site`)'
            );
        });

        it('omits the id when absent', () => {
            expect(lineFor({ kind: 'settings', label: 'Site' })).toBe(
                'Settings screen `Site`'
            );
        });
    });

    describe('pages', () => {
        it('appends the id when present', () => {
            expect(lineFor({ kind: 'pages', id: 'dashboard', label: 'Dashboard' })).toBe(
                'Admin page `Dashboard` (id `dashboard`)'
            );
        });

        it('omits the id when absent', () => {
            expect(lineFor({ kind: 'pages', label: 'Dashboard' })).toBe(
                'Admin page `Dashboard`'
            );
        });
    });

    describe('message shape', () => {
        it('pins the exact content of a two-entry list', () => {
            const message = formatAIContextMessage([
                {
                    reference: {
                        kind: 'entries',
                        type: 'posts',
                        id: 'p1',
                        label: 'Hello',
                    },
                    depth: 1,
                    order: 0,
                },
                {
                    reference: { kind: 'entries', type: 'posts', label: 'Posts' },
                    depth: 0,
                    order: 0,
                },
            ]);
            expect(message).toEqual({
                role: 'system',
                content:
                    'The user is currently viewing, from least to most specific:\n' +
                    '1. Entry list for type `posts` (`Posts`)\n' +
                    '2. Entry `Hello` (type `posts`, id `p1`)',
            });
        });
    });
});
