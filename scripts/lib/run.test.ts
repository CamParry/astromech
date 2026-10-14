/**
 * Tests of `scripts/lib/run.ts`, on `node -e` child processes.
 */
import assert from 'node:assert/strict';
import process from 'node:process';
import { test } from 'node:test';
import { capture, succeeds } from './run.ts';

const node = process.execPath;

test('capture returns standard output, trimmed, whatever happens to standard error', () => {
    const script = 'console.log(" out "); console.error("err")';
    assert.equal(capture(node, ['-e', script], { stderr: 'ignore' }), 'out');
    assert.equal(capture(node, ['-e', script], { stderr: 'pipe' }), 'out');
});

test('capture takes no stdio, so it cannot drop the output it returns', () => {
    // With standard output ignored, `execFileSync` returns null, which
    // `capture` cannot trim, so a passed-on `stdio` would throw on success.
    // @ts-expect-error -- `stdio` is not a capture option
    const output = capture(node, ['-e', 'console.log("out")'], { stdio: 'ignore' });
    assert.equal(output, 'out');
});

test('capture throws when the command exits with a code but 0', () => {
    assert.throws(() => capture(node, ['-e', 'process.exit(3)'], { stderr: 'ignore' }));
});

test('succeeds is true only for a command that exits with 0', () => {
    assert.equal(succeeds(node, ['-e', 'console.log("out")']), true);
    assert.equal(succeeds(node, ['-e', 'process.exit(1)']), false);
    assert.equal(succeeds(node, ['-e', 'process.kill(process.pid, "SIGTERM")']), false);
    assert.equal(succeeds('astromech-no-such-command', []), false);
});
