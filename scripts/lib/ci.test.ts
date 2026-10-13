/**
 * Tests of `scripts/lib/ci.ts` against a stand-in for `gh`, which answers each
 * call from a script of replies and records the calls it got.
 */
import type { Gh } from './ci.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CiUnknown, watchCi } from './ci.ts';

/** What the stand-in does for one call: return this output, or fail with this message. */
type Reply = { output: string } | { error: string };

const SHA = 'abc123';
const RUNS = JSON.stringify([{ databaseId: 7, name: 'CI' }]);
const BAD_GATEWAY = 'HTTP 502: Bad Gateway (https://api.github.com/graphql)';
const FAST = { appearIntervalMs: 0, retryDelayMs: 0 };

/**
 * A `gh` that answers each command, named by its first three words, from
 * `replies` in order, repeating the last reply once they run out.
 */
function fakeGh(replies: Record<string, Reply[]>): Gh & { calls: string[] } {
    const calls: string[] = [];
    const answer = (args: string[]): Reply => {
        const key = args.slice(0, 3).join(' ');
        calls.push(args.join(' '));
        const queue = replies[key];
        assert.ok(queue !== undefined && queue.length > 0, `unexpected call: gh ${key}`);
        return queue.length > 1 ? queue.shift()! : queue[0]!;
    };
    return {
        calls,
        capture: (args) => {
            const reply = answer(args);
            if ('error' in reply) throw new Error(reply.error);
            return reply.output;
        },
        run: async (args) => {
            const reply = answer(args);
            if ('error' in reply) throw new Error(reply.error);
        },
    };
}

test('a passing run passes', async () => {
    const gh = fakeGh({
        'run list --commit': [{ output: RUNS }],
        'run watch --exit-status': [{ output: '' }],
    });
    assert.equal(await watchCi(SHA, gh, FAST), true);
});

test('a transient error while listing the runs is retried', async () => {
    const gh = fakeGh({
        'run list --commit': [{ error: BAD_GATEWAY }, { output: RUNS }],
        'run watch --exit-status': [{ output: '' }],
    });
    assert.equal(await watchCi(SHA, gh, FAST), true);
});

test('a watch that fails while the run is still going is watched again, not taken for a failed run', async () => {
    const gh = fakeGh({
        'run list --commit': [{ output: RUNS }],
        'run watch --exit-status': [{ error: BAD_GATEWAY }, { output: '' }],
        'run view 7': [
            { error: BAD_GATEWAY },
            { output: JSON.stringify({ status: 'in_progress', conclusion: '' }) },
        ],
    });
    assert.equal(await watchCi(SHA, gh, FAST), true);
    assert.equal(gh.calls.filter((call) => call.startsWith('run watch')).length, 2);
});

test('a failed run does not pass, and its log is read', async () => {
    const gh = fakeGh({
        'run list --commit': [{ output: RUNS }],
        'run watch --exit-status': [{ error: 'exit status 1' }],
        'run view 7': [
            { output: JSON.stringify({ status: 'completed', conclusion: 'failure' }) },
            { output: 'job failed' },
        ],
    });
    assert.equal(await watchCi(SHA, gh, FAST), false);
    assert.ok(gh.calls.includes('run view 7 --log-failed'));
});

test('gh failing every time gives up with the command that finishes the watch', async () => {
    const gh = fakeGh({
        'run list --commit': [{ output: RUNS }],
        'run watch --exit-status': [{ error: BAD_GATEWAY }],
        'run view 7': [{ error: BAD_GATEWAY }],
    });
    await assert.rejects(watchCi(SHA, gh, FAST), (error: unknown) => {
        assert.ok(error instanceof CiUnknown);
        assert.match(error.message, /502/);
        assert.equal(error.byHand, 'gh run watch --exit-status 7');
        return true;
    });
});

test('gh failing every time while listing the runs gives up with the list command', async () => {
    const gh = fakeGh({ 'run list --commit': [{ error: BAD_GATEWAY }] });
    await assert.rejects(watchCi(SHA, gh, FAST), (error: unknown) => {
        assert.ok(error instanceof CiUnknown);
        assert.equal(error.byHand, `gh run list --commit ${SHA}`);
        return true;
    });
});
