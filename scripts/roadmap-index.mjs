#!/usr/bin/env node
/**
 * Writes the progress index into `roadmap/README.md`: every roadmap file grouped by its
 * `milestone` frontmatter field, then by its status directory. Fails when a file in
 * `proposed/`, `planned/` or `in-progress/` has no milestone, or one other than `1.0` or
 * `later`. With `--check` it writes nothing and fails when the README's index is stale.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const roadmapDir = join(repoRoot, 'roadmap');
const readmePath = join(roadmapDir, 'README.md');

const MILESTONES = ['1.0', 'later'];

// In the order the summary line lists them. A completed file needs no milestone,
// and counts only when it has one.
const STATUSES = [
    { dir: 'completed', label: 'completed', required: false },
    { dir: 'in-progress', label: 'in progress', required: true },
    { dir: 'planned', label: 'planned', required: true },
    { dir: 'proposed', label: 'proposed', required: true },
];

const START = '<!-- roadmap-index:start -->';
const END = '<!-- roadmap-index:end -->';

const FRONTMATTER = /^---\n([\s\S]*?)\n---\n/;
const MILESTONE_LINE = /^milestone:\s*['"]?([^'"\n]*?)['"]?\s*$/m;
const TITLE_LINE = /^# (.+)$/m;

const check = process.argv.includes('--check');

const files = [];
const problems = [];

for (const status of STATUSES) {
    const names = readdirSync(join(roadmapDir, status.dir))
        .filter((name) => name.endsWith('.md'))
        .sort();
    for (const name of names) {
        const path = `${status.dir}/${name}`;
        const text = readFileSync(join(roadmapDir, path), 'utf8');
        const milestone = text.match(FRONTMATTER)?.[1].match(MILESTONE_LINE)?.[1];
        if (milestone === undefined) {
            if (status.required) problems.push(`${path}: no \`milestone\` field`);
            continue;
        }
        if (!MILESTONES.includes(milestone)) {
            problems.push(
                `${path}: milestone "${milestone}" is not ${MILESTONES.join(' or ')}`
            );
            continue;
        }
        const title = text.match(TITLE_LINE)?.[1].trim() ?? name.replace(/\.md$/, '');
        files.push({ path, status, milestone, title });
    }
}

if (problems.length > 0) {
    console.error(`roadmap: ${problems.length} file(s) without a valid milestone:\n`);
    for (const problem of problems) console.error(`  roadmap/${problem}`);
    console.error(
        `\nStart the file with a frontmatter block holding \`milestone: ${MILESTONES.join('` or `milestone: ')}\`.`
    );
    process.exit(1);
}

const index = buildIndex();
const readme = readFileSync(readmePath, 'utf8');
const start = readme.indexOf(START);
const end = readme.indexOf(END);
if (start === -1 || end < start) {
    console.error(
        `roadmap: roadmap/README.md is missing the ${START} and ${END} markers`
    );
    process.exit(1);
}
const updated = `${readme.slice(0, start + START.length)}\n\n${index}\n\n${readme.slice(end)}`;

if (check) {
    if (updated !== readme) {
        console.error('roadmap/README.md is stale: run `pnpm run roadmap`');
        process.exit(1);
    }
    console.log('roadmap: every live file has a milestone, and the index is current');
} else {
    if (updated !== readme) writeFileSync(readmePath, updated);
    console.log('roadmap: wrote the index in roadmap/README.md');
}

// Per milestone: a summary line counting each status, then one bullet per status
// that has files, with its files nested under it as links relative to `roadmap/`.
function buildIndex() {
    const blocks = [];
    for (const milestone of MILESTONES) {
        const inMilestone = files.filter((file) => file.milestone === milestone);
        const counts = STATUSES.map(
            (status) =>
                `${inMilestone.filter((file) => file.status === status).length} ${status.label}`
        );
        const lines = [`**${milestone}:** ${counts.join(', ')}`, ''];
        for (const status of STATUSES) {
            const links = inMilestone
                .filter((file) => file.status === status)
                .map((file) => `[${file.title}](${file.path})`);
            if (links.length === 0) continue;
            const label = status.label[0].toUpperCase() + status.label.slice(1);
            lines.push(`- ${label}:`, ...links.map((link) => `    - ${link}`));
        }
        blocks.push(lines.join('\n').trimEnd());
    }
    return blocks.join('\n\n');
}
