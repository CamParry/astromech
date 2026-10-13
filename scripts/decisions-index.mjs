#!/usr/bin/env node
/**
 * Writes the index into `DECISIONS.md`: every `decisions/*.md` file grouped by its `area`
 * frontmatter field, one link per decision sorted by title. Fails, naming the file, when a
 * decision has no `area`, an unknown one, or no `# ` title. With `--check` it writes nothing
 * and fails when the index is stale.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const decisionsDir = join(repoRoot, 'decisions');
const indexPath = join(repoRoot, 'DECISIONS.md');

// In the order the index lists them. An area with no files is left out.
const AREAS = [
    { key: 'data', heading: 'Data and schema' },
    { key: 'config', heading: 'Config, boot and packaging' },
    { key: 'structure', heading: 'Structure and extension' },
    { key: 'ai', heading: 'AI and the assistant' },
    { key: 'product', heading: 'Product shape' },
    { key: 'toolchain', heading: 'Toolchain' },
    { key: 'naming', heading: 'Reserved words' },
];

const START = '<!-- decisions-index:start -->';
const END = '<!-- decisions-index:end -->';

const FRONTMATTER = /^---\n([\s\S]*?)\n---\n/;
const AREA_LINE = /^area:\s*['"]?([^'"\n]*?)['"]?\s*$/m;
const TITLE_LINE = /^# (.+)$/m;

const check = process.argv.includes('--check');

const files = [];
const problems = [];

const names = readdirSync(decisionsDir)
    .filter((name) => name.endsWith('.md'))
    .sort();
for (const name of names) {
    const text = readFileSync(join(decisionsDir, name), 'utf8');
    const area = text.match(FRONTMATTER)?.[1].match(AREA_LINE)?.[1];
    const title = text.match(TITLE_LINE)?.[1].trim();
    if (area === undefined) {
        problems.push(`${name}: no \`area\` field`);
    } else if (!AREAS.some((known) => known.key === area)) {
        problems.push(`${name}: area "${area}" is not one of ${areaKeys()}`);
    }
    if (!title) problems.push(`${name}: no \`# \` title`);
    files.push({ name, area, title });
}

if (problems.length > 0) {
    console.error(`decisions: ${problems.length} problem(s):\n`);
    for (const problem of problems) console.error(`  decisions/${problem}`);
    console.error(
        `\nStart each file with a frontmatter block holding \`area:\` (one of ${areaKeys()}), then a \`# \` title.`
    );
    process.exit(1);
}

const index = buildIndex();
const source = readFileSync(indexPath, 'utf8');
const start = source.indexOf(START);
const end = source.indexOf(END);
if (start === -1 || end < start) {
    console.error(`decisions: DECISIONS.md is missing the ${START} and ${END} markers`);
    process.exit(1);
}
const updated = `${source.slice(0, start + START.length)}\n\n${index}\n\n${source.slice(end)}`;

if (check) {
    if (updated !== source) {
        console.error('DECISIONS.md is stale: run `pnpm run decisions`');
        process.exit(1);
    }
    console.log(
        'decisions: every file has an area and a title, and the index is current'
    );
} else {
    if (updated !== source) writeFileSync(indexPath, updated);
    console.log('decisions: wrote the index in DECISIONS.md');
}

// One `##` heading per area that has files, then one link per decision, sorted by title
// with its backticks ignored, so a title that opens on code sorts by its first word.
function buildIndex() {
    const blocks = [];
    for (const area of AREAS) {
        const links = files
            .filter((file) => file.area === area.key)
            .sort((a, b) =>
                sortKey(a.title).localeCompare(sortKey(b.title), 'en', {
                    sensitivity: 'base',
                })
            )
            .map((file) => `- [${file.title}](decisions/${file.name})`);
        if (links.length === 0) continue;
        blocks.push([`## ${area.heading}`, '', ...links].join('\n'));
    }
    return blocks.join('\n\n');
}

function sortKey(title) {
    return title.replaceAll('`', '');
}

function areaKeys() {
    return AREAS.map((area) => `\`${area.key}\``).join(', ');
}
