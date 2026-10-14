/**
 * The two generated indexes in the docs: the roadmap's progress index in
 * `roadmap/README.md`, and the decisions index in `DECISIONS.md`. Each reads
 * the frontmatter of the markdown files under one directory, says which files
 * it cannot index, and writes its index between two marker comments.
 * `scripts/docs-index.ts` runs one.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** A markdown file under an index's directory, by its path relative to that directory. */
export type SourceFile = { readonly path: string; readonly text: string };

export type DocsIndex = {
    /** The name on its output lines and the argument that selects it. */
    readonly name: 'roadmap' | 'decisions';
    /** The file the index is written into, relative to the repository root. */
    readonly target: string;
    readonly start: string;
    readonly end: string;
    /** Every markdown file the index reads. */
    readonly read: (repoRoot: string) => SourceFile[];
    /** The index text, or the files it cannot index and how to fix them. */
    readonly build: (
        files: readonly SourceFile[]
    ) => { index: string } | { problems: string[]; hint: string };
    /** The line `--check` prints when the index is current. */
    readonly passed: string;
};

const FRONTMATTER = /^---\n([\s\S]*?)\n---\n/;
const TITLE_LINE = /^# (.+)$/m;

/** The value of `field` in the file's frontmatter, unquoted, or undefined. */
export function frontmatterField(text: string, field: string): string | undefined {
    const block = FRONTMATTER.exec(text)?.[1];
    if (block === undefined) return undefined;
    return new RegExp(`^${field}:\\s*['"]?([^'"\\n]*?)['"]?\\s*$`, 'm').exec(block)?.[1];
}

function title(text: string): string | undefined {
    return TITLE_LINE.exec(text)?.[1]?.trim();
}

/** The `.md` files directly in `directory`, sorted by name. */
function markdownFiles(directory: string, prefix: string): SourceFile[] {
    return readdirSync(directory)
        .filter((name) => name.endsWith('.md'))
        .sort()
        .map((name) => ({
            path: `${prefix}${name}`,
            text: readFileSync(join(directory, name), 'utf8'),
        }));
}

const MILESTONES = ['1.0', 'later'];

// In the order the summary line lists them. A completed file needs no
// milestone, and counts only when it has one.
const STATUSES = [
    { dir: 'completed', label: 'completed', required: false },
    { dir: 'in-progress', label: 'in progress', required: true },
    { dir: 'planned', label: 'planned', required: true },
    { dir: 'proposed', label: 'proposed', required: true },
] as const;

/**
 * Every roadmap file grouped by its `milestone` field, then by its status
 * directory. A file in `proposed/`, `planned/` or `in-progress/` needs a
 * milestone of `1.0` or `later`.
 */
export const roadmapIndex: DocsIndex = {
    name: 'roadmap',
    target: 'roadmap/README.md',
    start: '<!-- roadmap-index:start -->',
    end: '<!-- roadmap-index:end -->',
    read: (repoRoot) =>
        STATUSES.flatMap((status) =>
            markdownFiles(join(repoRoot, 'roadmap', status.dir), `${status.dir}/`)
        ),
    build(files) {
        const problems: string[] = [];
        const entries: (SourceFile & {
            status: (typeof STATUSES)[number];
            milestone: string;
            title: string;
        })[] = [];
        for (const file of files) {
            const status = STATUSES.find(({ dir }) => file.path.startsWith(`${dir}/`));
            if (status === undefined) continue;
            const milestone = frontmatterField(file.text, 'milestone');
            if (milestone === undefined) {
                if (status.required)
                    problems.push(`${file.path}: no \`milestone\` field`);
                continue;
            }
            if (!MILESTONES.includes(milestone)) {
                problems.push(
                    `${file.path}: milestone "${milestone}" is not ${MILESTONES.join(' or ')}`
                );
                continue;
            }
            const name = file.path.slice(file.path.lastIndexOf('/') + 1, -'.md'.length);
            entries.push({ ...file, status, milestone, title: title(file.text) ?? name });
        }
        if (problems.length > 0) {
            return {
                problems,
                hint: `Start the file with a frontmatter block holding \`milestone: ${MILESTONES.join('` or `milestone: ')}\`.`,
            };
        }
        // Per milestone: a summary line counting each status, then one bullet
        // per status that has files, with its files nested under it as links
        // relative to `roadmap/`.
        const blocks = MILESTONES.map((milestone) => {
            const inMilestone = entries.filter((entry) => entry.milestone === milestone);
            const counts = STATUSES.map(
                (status) =>
                    `${inMilestone.filter((entry) => entry.status === status).length} ${status.label}`
            );
            const lines = [`**${milestone}:** ${counts.join(', ')}`, ''];
            for (const status of STATUSES) {
                const links = inMilestone
                    .filter((entry) => entry.status === status)
                    .map((entry) => `[${entry.title}](${entry.path})`);
                if (links.length === 0) continue;
                const label = status.label[0]?.toUpperCase() + status.label.slice(1);
                lines.push(`- ${label}:`, ...links.map((link) => `    - ${link}`));
            }
            return lines.join('\n').trimEnd();
        });
        return { index: blocks.join('\n\n') };
    },
    passed: 'every live file has a milestone, and the index is current',
};

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

const areaKeys = AREAS.map((area) => `\`${area.key}\``).join(', ');

/**
 * Every `decisions/*.md` file grouped by its `area` field, one link per
 * decision sorted by title. Each needs a known area and a `# ` title.
 */
export const decisionsIndex: DocsIndex = {
    name: 'decisions',
    target: 'DECISIONS.md',
    start: '<!-- decisions-index:start -->',
    end: '<!-- decisions-index:end -->',
    read: (repoRoot) => markdownFiles(join(repoRoot, 'decisions'), ''),
    build(files) {
        const problems: string[] = [];
        const entries = files.map((file) => {
            const area = frontmatterField(file.text, 'area');
            const heading = title(file.text);
            if (area === undefined) {
                problems.push(`${file.path}: no \`area\` field`);
            } else if (!AREAS.some((known) => known.key === area)) {
                problems.push(`${file.path}: area "${area}" is not one of ${areaKeys}`);
            }
            if (!heading) problems.push(`${file.path}: no \`# \` title`);
            return { ...file, area, title: heading ?? '' };
        });
        if (problems.length > 0) {
            return {
                problems,
                hint: `Start each file with a frontmatter block holding \`area:\` (one of ${areaKeys}), then a \`# \` title.`,
            };
        }
        // One `##` heading per area that has files, then one link per decision,
        // sorted by title with its backticks ignored, so a title that opens on
        // code sorts by its first word.
        const sortKey = (text: string): string => text.replaceAll('`', '');
        const blocks = AREAS.flatMap((area) => {
            const links = entries
                .filter((entry) => entry.area === area.key)
                .sort((a, b) =>
                    sortKey(a.title).localeCompare(sortKey(b.title), 'en', {
                        sensitivity: 'base',
                    })
                )
                .map((entry) => `- [${entry.title}](decisions/${entry.path})`);
            return links.length === 0
                ? []
                : [[`## ${area.heading}`, '', ...links].join('\n')];
        });
        return { index: blocks.join('\n\n') };
    },
    passed: 'every file has an area and a title, and the index is current',
};

export const INDEXES = [roadmapIndex, decisionsIndex] as const;

/**
 * `source` with `index` in place of what stands between the markers, or
 * undefined when either marker is missing.
 */
export function spliceIndex(
    source: string,
    { start, end }: Pick<DocsIndex, 'start' | 'end'>,
    index: string
): string | undefined {
    const from = source.indexOf(start);
    const to = source.indexOf(end);
    if (from === -1 || to < from) return undefined;
    return `${source.slice(0, from + start.length)}\n\n${index}\n\n${source.slice(to)}`;
}
