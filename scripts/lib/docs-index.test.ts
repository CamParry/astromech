/**
 * Tests of `scripts/lib/docs-index.ts`, on file texts held in memory.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    decisionsIndex,
    frontmatterField,
    roadmapIndex,
    spliceIndex,
} from './docs-index.ts';

test('frontmatterField reads a field, quoted or not, only from the frontmatter', () => {
    assert.equal(frontmatterField('---\nmilestone: 1.0\n---\n# A\n', 'milestone'), '1.0');
    assert.equal(frontmatterField("---\narea: 'data'\n---\n", 'area'), 'data');
    assert.equal(frontmatterField('# A\n\nmilestone: 1.0\n', 'milestone'), undefined);
});

test('the roadmap index groups files by milestone, then status', () => {
    const built = roadmapIndex.build([
        { path: 'completed/old.md', text: '# Old\n' },
        { path: 'completed/done.md', text: '---\nmilestone: 1.0\n---\n# Done\n' },
        { path: 'planned/next.md', text: '---\nmilestone: 1.0\n---\n# Next\n' },
        { path: 'proposed/maybe.md', text: '---\nmilestone: later\n---\n' },
    ]);
    assert.deepEqual(built, {
        index: [
            '**1.0:** 1 completed, 0 in progress, 1 planned, 0 proposed',
            '',
            '- Completed:',
            '    - [Done](completed/done.md)',
            '- Planned:',
            '    - [Next](planned/next.md)',
            '',
            '**later:** 0 completed, 0 in progress, 0 planned, 1 proposed',
            '',
            '- Proposed:',
            '    - [maybe](proposed/maybe.md)',
        ].join('\n'),
    });
});

test('the roadmap index names a live file without a valid milestone', () => {
    const built = roadmapIndex.build([
        { path: 'planned/none.md', text: '# None\n' },
        { path: 'proposed/odd.md', text: '---\nmilestone: 2.0\n---\n# Odd\n' },
    ]);
    assert.ok('problems' in built);
    assert.deepEqual(built.problems, [
        'planned/none.md: no `milestone` field',
        'proposed/odd.md: milestone "2.0" is not 1.0 or later',
    ]);
});

test('the decisions index groups by area and sorts by title without backticks', () => {
    const built = decisionsIndex.build([
        { path: 'b.md', text: '---\narea: data\n---\n# `beta` rules\n' },
        { path: 'a.md', text: '---\narea: data\n---\n# Alpha\n' },
        { path: 'n.md', text: '---\narea: naming\n---\n# Words\n' },
    ]);
    assert.deepEqual(built, {
        index: [
            '## Data and schema',
            '',
            '- [Alpha](decisions/a.md)',
            '- [`beta` rules](decisions/b.md)',
            '',
            '## Reserved words',
            '',
            '- [Words](decisions/n.md)',
        ].join('\n'),
    });
});

test('the decisions index names a file with no area, an unknown one or no title', () => {
    const built = decisionsIndex.build([
        { path: 'a.md', text: '# A\n' },
        { path: 'b.md', text: '---\narea: nope\n---\n' },
    ]);
    assert.ok('problems' in built);
    assert.equal(built.problems.length, 3);
});

test('spliceIndex replaces only what stands between the markers', () => {
    const markers = { start: '<!-- s -->', end: '<!-- e -->' };
    assert.equal(
        spliceIndex('head\n<!-- s -->\nold\n<!-- e -->\ntail\n', markers, 'new'),
        'head\n<!-- s -->\n\nnew\n\n<!-- e -->\ntail\n'
    );
    assert.equal(spliceIndex('no markers', markers, 'new'), undefined);
});
