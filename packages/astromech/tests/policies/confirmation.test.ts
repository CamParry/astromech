/**
 * Confirmation — a brake, not a boundary.
 *
 * Two things are being pinned. First, that a refusal is legible: a caller must
 * be able to tell "you said no" from "you didn't answer", because one means move
 * on and the other means the question may be worth re-asking. Second, that
 * nothing leaks past a refusal — it carries no arguments, and the reserved
 * key never reaches a service on any path.
 */
import type { ConfirmDecision } from '@/policies/confirmation';
import type {
    CoreManifestMethod,
    EntriesManifestMethod,
    ManifestMethod,
} from '@/types/index';
import { describe, expect, it } from 'vitest';
import { evaluateConfirmation } from '@/policies/confirmation';

function coreMethod(
    module: string,
    name: string,
    effect: { mutates: boolean; destructive?: boolean }
): CoreManifestMethod {
    return {
        id: `${module}.${name}`,
        name: `${module}.${name}`,
        source: 'core',
        module,
        method: name,
        permission: null,
        mutates: effect.mutates,
        destructive: effect.destructive ?? false,
        idempotent: false,
    };
}

function entryMethod(
    type: string,
    name: string,
    effect: { mutates: boolean; destructive?: boolean }
): EntriesManifestMethod {
    return {
        id: `entries.${type}.${name}`,
        name: `entries.${name}`,
        source: 'entries',
        method: name,
        typeId: type,
        entryType: type,
        namespace: 'root',
        permission: `entry:${type}:${name}`,
        mutates: effect.mutates,
        destructive: effect.destructive ?? false,
        idempotent: false,
    };
}

const usersQuery = coreMethod('users', 'query', { mutates: false });
const settingsSet = coreMethod('settings', 'set', { mutates: true });
const postsUpdate = entryMethod('posts', 'update', { mutates: true });
const postsDelete = entryMethod('posts', 'delete', {
    mutates: true,
    destructive: true,
});

/** Narrow to the refused branch, so the assertions can read `outcome`. */
function refusal(decision: ConfirmDecision) {
    expect(decision.proceed).toBe(false);
    if (decision.proceed) throw new Error('expected a refusal');
    return decision.outcome;
}

describe('triggering', () => {
    it('never gates a non-mutating method, under either preset', () => {
        for (const trigger of ['mutating', 'destructive'] as const) {
            const decision = evaluateConfirmation(usersQuery, { limit: 10 }, { trigger });
            expect(decision).toEqual({ proceed: true, args: { limit: 10 } });
        }
    });

    it('destructive mode gates a destructive method and lets a merely-mutating one through', () => {
        const gated = evaluateConfirmation(
            postsDelete,
            { id: 'abc' },
            { trigger: 'destructive' }
        );
        expect(refusal(gated).status).toBe('input_required');

        const through = evaluateConfirmation(
            postsUpdate,
            { id: 'abc' },
            { trigger: 'destructive' }
        );
        expect(through).toEqual({ proceed: true, args: { id: 'abc' } });
    });

    it('honours a function trigger, which is handed the whole method', () => {
        const seen: string[] = [];
        const trigger = (method: ManifestMethod): boolean => {
            seen.push(method.id);
            return method.source === 'entries';
        };

        expect(
            refusal(evaluateConfirmation(postsUpdate, { id: 'abc' }, { trigger })).status
        ).toBe('input_required');
        expect(evaluateConfirmation(settingsSet, { key: 'a' }, { trigger }).proceed).toBe(
            true
        );
        expect(seen).toEqual(['entries.posts.update', 'settings.set']);
    });

    it('defaults to mutating when no trigger is named', () => {
        expect(refusal(evaluateConfirmation(settingsSet, {}, {})).status).toBe(
            'input_required'
        );
        expect(evaluateConfirmation(usersQuery, {}, {}).proceed).toBe(true);
    });
});

describe('input_required', () => {
    it('asks a question naming the method and the concrete target', () => {
        // A prompt that says "confirm this action?" is useless to the human it
        // is for, so the message is asserted on, not just its presence.
        const outcome = refusal(
            evaluateConfirmation(
                postsUpdate,
                { type: 'posts', id: '01JABC', data: { title: 'x' } },
                {}
            )
        );

        expect(outcome.status).toBe('input_required');
        if (outcome.status !== 'input_required') throw new Error('unreachable');

        const request = outcome.requests[0];
        expect(outcome.requests).toHaveLength(1);
        expect(request?.method).toBe('entries.posts.update');
        expect(request?.message).toContain('entries.posts.update');
        expect(request?.message).toContain('posts');
        expect(request?.message).toContain('01JABC');
        expect(request?.destructive).toBe(false);
        expect(request?.arguments).toEqual({
            type: 'posts',
            id: '01JABC',
            data: { title: 'x' },
        });
    });

    it('flags a destructive method in the request and in the message', () => {
        const outcome = refusal(
            evaluateConfirmation(postsDelete, { type: 'posts', id: '01JABC' }, {})
        );
        if (outcome.status !== 'input_required') throw new Error('unreachable');

        expect(outcome.requests[0]?.destructive).toBe(true);
        expect(outcome.requests[0]?.message).toContain('destructive');
    });
});

describe('answers', () => {
    it('proceeds on accept, handing on args with no reserved key', () => {
        const decision = evaluateConfirmation(
            postsUpdate,
            { type: 'posts', id: 'abc', _confirm: { action: 'accept' } },
            {}
        );

        expect(decision).toEqual({
            proceed: true,
            args: { type: 'posts', id: 'abc' },
        });
        expect(decision.proceed && '_confirm' in decision.args).toBe(false);
    });

    it('distinguishes decline from cancel, and neither yields executable args', () => {
        // THE verify criterion. Elicitation separates the two — a decline is an
        // answer ("no"), a cancel is the absence of one ("I'm not answering") —
        // and a caller has to be able to act on the difference. Both leave state
        // untouched: the gate runs before the service, so nothing ran either way.
        const declined = evaluateConfirmation(
            postsDelete,
            { type: 'posts', id: 'abc', _confirm: { action: 'decline' } },
            {}
        );
        const cancelled = evaluateConfirmation(
            postsDelete,
            { type: 'posts', id: 'abc', _confirm: { action: 'cancel' } },
            {}
        );

        expect(declined.proceed).toBe(false);
        expect(cancelled.proceed).toBe(false);

        expect(refusal(declined)).toEqual({
            status: 'declined',
            method: 'entries.posts.delete',
        });
        expect(refusal(cancelled)).toEqual({
            status: 'cancelled',
            method: 'entries.posts.delete',
        });
        expect(refusal(declined).status).not.toBe(refusal(cancelled).status);

        // The second half: a refusal carries nothing a caller could run with.
        for (const decision of [declined, cancelled]) {
            expect('args' in decision).toBe(false);
        }
    });
});

describe('the reserved key', () => {
    it('is stripped even when the method is not gated', () => {
        // An ungated method must never see it either: it would reach a Zod
        // schema that rejects unknown keys, or a loose `fields` record that
        // stores it.
        const decision = evaluateConfirmation(
            usersQuery,
            { limit: 10, _confirm: { action: 'accept' } },
            {}
        );

        expect(decision).toEqual({ proceed: true, args: { limit: 10 } });
    });

    it('does not mutate the caller’s argument object', () => {
        const args = { id: 'abc', _confirm: { action: 'accept' } };
        evaluateConfirmation(postsUpdate, args, {});
        expect(args._confirm).toEqual({ action: 'accept' });
    });

    it.each([
        ['null', null],
        ['a string', 'accept'],
        ['an empty object', {}],
        ['an unknown action', { action: 'yes' }],
        ['a nested action', { action: { value: 'accept' } }],
    ])('treats %s as unanswered rather than as an answer', (_label, value) => {
        // Fail closed: the only action a malformed answer could be read as is
        // `accept`, which would turn a typo into an approval.
        const decision = evaluateConfirmation(
            postsDelete,
            { id: 'abc', _confirm: value },
            {}
        );

        expect(decision.proceed).toBe(false);
        expect(refusal(decision).status).toBe('input_required');
    });

    it('keeps the reserved key out of the arguments it echoes back', () => {
        const outcome = refusal(
            evaluateConfirmation(postsDelete, { id: 'abc', _confirm: 'nonsense' }, {})
        );
        if (outcome.status !== 'input_required') throw new Error('unreachable');

        expect(outcome.requests[0]?.arguments).toEqual({ id: 'abc' });
    });
});
