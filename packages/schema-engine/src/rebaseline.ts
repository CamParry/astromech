/**
 * Rebaseline parser: splits a baseline migration's source into one block per
 * `// ── <table> ──` banner, and refuses a rewrite that would drop source the
 * emitter cannot regenerate. Pure (no fs): `rebaselineMigrations` in
 * `generate.ts` reads and writes the files.
 */
import type { Snapshot } from './model';

type TableBlock = { name: string; source: string };

const BANNER = /^\s*\/\/ ── (\S+) ─+\s*$/;

/**
 * Split a baseline's `up()` body into one block per table, keyed by the
 * `// ── <table> ──` banner each block opens with. Refuses rather than guessing:
 * a block boundary it cannot see is a hand-authored table it would silently drop.
 */
export function parseTableBlocks(source: string, path: string): TableBlock[] {
    const lines = source.split('\n');
    const start = lines.findIndex((line) => line.startsWith('export async function up('));
    // The body ends at the FIRST unindented `}` after `up(`, not the last one in
    // the file: `renderBaselineFile` emits `up()` and nothing else, so anything
    // below that brace — a `down()`, a module-level helper — is source the
    // rewrite would drop.
    const closing =
        start === -1 ? -1 : lines.findIndex((line, i) => i > start && /^}/.test(line));
    if (start === -1 || closing === -1) {
        throw new Error(
            `cannot rebaseline "${path}": no \`export async function up(\` … \`}\` body found.`
        );
    }
    const trailing = lines.slice(closing + 1).find((line) => line.trim() !== '');
    if (trailing !== undefined) {
        throw new Error(
            `cannot rebaseline "${path}": "${trailing.trim()}" follows the \`up()\` body. ` +
                'db:rebaseline emits `up()` and nothing else, so this source would be ' +
                'dropped. Remove it, or rebaseline by hand.'
        );
    }

    const blocks: TableBlock[] = [];
    let current: { name: string; lines: string[] } | null = null;
    for (const line of lines.slice(start + 1, closing)) {
        const banner = BANNER.exec(line);
        if (banner?.[1] !== undefined) {
            if (current) blocks.push(toBlock(current));
            current = { name: banner[1], lines: [line] };
            continue;
        }
        if (!current) {
            if (line.trim() === '') continue;
            throw new Error(
                `cannot rebaseline "${path}": the statement "${line.trim()}" sits before the ` +
                    'first `// ── <table> ──` banner, so it belongs to no table. Add a banner ' +
                    'for it, or rebaseline by hand.'
            );
        }
        current.lines.push(line);
    }
    if (current) blocks.push(toBlock(current));

    if (blocks.length === 0) {
        throw new Error(
            `cannot rebaseline "${path}": it has no \`// ── <table> ──\` banners to split on.`
        );
    }
    return blocks;
}

/**
 * Refuse to delete a later migration holding anything the regenerated baseline
 * cannot reproduce: descriptor-backed DDL is safe to drop, but a statement on a
 * table the snapshot doesn't describe, or any data statement, exists only here.
 */
export function assertCollapsible(
    source: string,
    path: string,
    snapshot: Snapshot
): void {
    const safe =
        'A regenerated baseline reproduces descriptor-backed CREATE TABLE / CREATE INDEX ' +
        'from `snapshot.json`, so dropping those is safe; this is not. Squash the chain ' +
        'by hand, then rebaseline.';

    for (const { statement } of readSqlCalls(source)) {
        const intoRebuildTemp =
            statement.tables.length > 0 &&
            statement.tables.every((table) => isRebuildTemp(table, snapshot));
        if (isDataStatement(statement.kind) && !intoRebuildTemp) {
            const target =
                statement.tables[0] !== undefined
                    ? `"${statement.tables[0]}"`
                    : abbreviate(statement.text);
            throw new Error(
                `cannot collapse "${path}": ${statement.kind} on ${target} is a data ` +
                    'statement, and the descriptors record schema only, so the rows it ' +
                    `writes would be lost. ${safe}`
            );
        }
        for (const table of statement.tables) {
            if (snapshot.tables[table] !== undefined) continue;
            if (isRebuildTemp(table, snapshot)) continue;
            throw new Error(
                `cannot collapse "${path}": ${statement.kind} names "${table}", a table ` +
                    `no descriptor describes, so the emitter cannot regenerate it. ${safe}`
            );
        }
    }
}

/**
 * Refuse a block the emitter is about to replace when it holds anything but its
 * own table's CREATE TABLE / CREATE INDEX — everything else in it is source the
 * rewrite would silently discard.
 */
export function assertReEmittable(block: TableBlock, path: string): void {
    const body = block.source.split('\n').slice(1).join('\n');
    const calls = readSqlCalls(body);

    for (const { statement } of calls) {
        const isCreate =
            statement.kind === 'CREATE TABLE' || statement.kind === 'CREATE INDEX';
        if (isCreate && statement.tables.every((t) => t === block.name)) continue;
        throw new Error(
            `cannot rebaseline "${path}": the "${block.name}" block holds ` +
                `"${abbreviate(statement.text)}". A block the descriptors describe is ` +
                'replaced by emitter output, which is CREATE TABLE / CREATE INDEX for ' +
                `"${block.name}" and nothing else, so this statement would be dropped. ` +
                'Move it to its own banner, or rebaseline by hand.'
        );
    }

    const leftover = maskCalls(body, calls)
        .split('\n')
        .map((line) => line.trim())
        .find((line) => line !== '');
    if (leftover !== undefined) {
        throw new Error(
            `cannot rebaseline "${path}": the "${block.name}" block holds "${leftover}", ` +
                'which is not a statement the emitter re-renders, so it would be dropped. ' +
                'Move it under its own `// ── <table> ──` banner, or rebaseline by hand.'
        );
    }
}

type SqlStatementKind =
    | 'CREATE TABLE'
    | 'CREATE INDEX'
    | 'ALTER TABLE'
    | 'DROP TABLE'
    | 'DROP INDEX'
    | 'INSERT'
    | 'UPDATE'
    | 'DELETE'
    | 'other';

type SqlStatement = { text: string; kind: SqlStatementKind; tables: string[] };
type SqlCall = { statement: SqlStatement; start: number; end: number };

/** `true` for the rebuild path's `__new_<table>` temp, where `<table>` is one
 *  the snapshot describes — the one name a collapsed migration may hold that
 *  the snapshot does not list, because the emitter writes it. */
function isRebuildTemp(table: string, snapshot: Snapshot): boolean {
    const prefix = '__new_';
    if (!table.startsWith(prefix)) return false;
    return snapshot.tables[table.slice(prefix.length)] !== undefined;
}

/** `INSERT`/`UPDATE`/`DELETE` move rows, which no snapshot records. */
function isDataStatement(kind: SqlStatementKind): boolean {
    return kind === 'INSERT' || kind === 'UPDATE' || kind === 'DELETE';
}

const SQL_CALL = /await sql`((?:\\[\s\S]|[^`\\])*)`\s*\.execute\(\s*db\s*\)\s*;/g;

/** Every `` await sql`…`.execute(db); `` in a migration's source, with the span
 *  it occupies so a caller can see what is left over. */
function readSqlCalls(source: string): SqlCall[] {
    const calls: SqlCall[] = [];
    for (const match of source.matchAll(SQL_CALL)) {
        const [whole, template = ''] = match;
        const text = template.replace(/\\`/g, '`').replace(/\\\$\{/g, '${');
        calls.push({
            statement: classifyStatement(text),
            start: match.index,
            end: match.index + whole.length,
        });
    }
    return calls;
}

/** Blank out every statement's span, leaving only the source around them. */
function maskCalls(source: string, calls: SqlCall[]): string {
    let masked = source;
    for (const call of [...calls].reverse()) {
        masked =
            masked.slice(0, call.start) +
            ' '.repeat(call.end - call.start) +
            masked.slice(call.end);
    }
    return masked;
}

/** A statement's kind and the tables it names. `other` covers everything with
 *  no table in it (`PRAGMA`, `SELECT`), which no rebaseline check acts on. */
function classifyStatement(text: string): SqlStatement {
    const sql = text.trim().replace(/\s+/g, ' ');
    const statementOf = (
        kind: SqlStatementKind,
        ...tables: (string | undefined)[]
    ): SqlStatement => ({
        text: sql,
        kind,
        tables: tables.filter((t): t is string => t !== undefined && t !== ''),
    });

    const createTable =
        /^CREATE (?:TEMP(?:ORARY) )?TABLE (?:IF NOT EXISTS )?`?(\w+)`?/i.exec(sql);
    if (createTable) return statementOf('CREATE TABLE', createTable[1]);

    const createIndex =
        /^CREATE (?:UNIQUE )?INDEX (?:IF NOT EXISTS )?`?\w+`? ON `?(\w+)`?/i.exec(sql);
    if (createIndex) return statementOf('CREATE INDEX', createIndex[1]);

    const alterTable = /^ALTER TABLE `?(\w+)`?(?: .*? RENAME TO `?(\w+)`?)?/i.exec(sql);
    if (alterTable) return statementOf('ALTER TABLE', alterTable[1], alterTable[2]);

    const dropTable = /^DROP TABLE (?:IF EXISTS )?`?(\w+)`?/i.exec(sql);
    if (dropTable) return statementOf('DROP TABLE', dropTable[1]);

    if (/^DROP INDEX /i.test(sql)) return statementOf('DROP INDEX');

    const insert = /^INSERT(?: OR \w+)? INTO `?(\w+)`?/i.exec(sql);
    if (insert) return statementOf('INSERT', insert[1]);

    const update = /^UPDATE(?: OR \w+)? `?(\w+)`?/i.exec(sql);
    if (update) return statementOf('UPDATE', update[1]);

    const del = /^DELETE FROM `?(\w+)`?/i.exec(sql);
    if (del) return statementOf('DELETE', del[1]);

    return statementOf('other');
}

/** Shorten a statement to something that fits in an error message. */
function abbreviate(text: string): string {
    return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}

function toBlock(current: { name: string; lines: string[] }): TableBlock {
    const lines = [...current.lines];
    while (lines[lines.length - 1]?.trim() === '') lines.pop();
    return { name: current.name, source: lines.join('\n') };
}
