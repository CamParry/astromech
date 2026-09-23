/**
 * The `where` DSL and its compiler: a clause over one table's columns, as a
 * Kysely predicate with every value serialized by the column codec. Used by
 * `createRepository` and by a joined query reading the table under an alias.
 */

import type { ColumnRuntime, Table, TableSelect } from '@/database/define-table';
import type { Expression, ExpressionBuilder, SqlBool } from 'kysely';
import { sql } from 'kysely';
import { AstromechError } from '@/errors/astromech-error';

/** The expression builder a clause compiles against: any table, any column. */
type AnyExpressionBuilder = ExpressionBuilder<
    Record<string, Record<string, unknown>>,
    string
>;

/** A compiled clause, ready for a query's `.where`. */
export type WhereFn = (eb: AnyExpressionBuilder) => Expression<SqlBool>;

type WhereOps<V> = {
    eq?: V | null;
    ne?: V | null;
    in?: readonly V[];
    notIn?: readonly V[];
    gt?: V;
    gte?: V;
    lt?: V;
    lte?: V;
    /** A raw SQL LIKE pattern, passed through verbatim: `%` and `_` in it are
     *  wildcards. For plain user-supplied text, use `contains`. */
    like?: string;
    /** Plain substring match. `%`, `_` and `\` are escaped, so a search for
     *  `100%` matches that literal text rather than everything after `100`. */
    contains?: string;
};

type WhereColumns<D> = {
    [K in keyof TableSelect<D>]?:
        | TableSelect<D>[K]
        | WhereOps<NonNullable<TableSelect<D>[K]>>
        | undefined;
};

/**
 * A `where` clause: bare value → `=`, bare `null` → `IS NULL`, and every key ANDs
 * with the rest. `or` is the one key that is not a column.
 *
 * `undefined` is in the union (not just implied by `?`) because
 * `exactOptionalPropertyTypes` would otherwise reject the conditional form
 * `{ deletedAt: includeTrashed ? undefined : null }` — the exact distinction the
 * null/undefined split exists to express.
 *
 * The runtime additionally reads a bare array as `in`, for loosely-typed callers
 * migrating off `tableRepository`. Typed callers use `{ in: [...] }`.
 */
export type Where<D> = WhereColumns<D> & {
    /**
     * Branches OR-ed together, then ANDed with the sibling keys:
     * `{ enabled: true, or: [{ nextRun: { lte: now } }, { nextRun: null }] }`.
     * A branch is an ordinary `Where`, so nesting falls out of the recursion,
     * and an empty array matches nothing (`1 = 0`).
     *
     * There is no `and` — sibling keys already AND. One arrives when a call
     * site needs `(A OR B) AND (C OR D)`; none does today.
     */
    or?: readonly Where<D>[] | undefined;
};

const OPERATORS = [
    'eq',
    'ne',
    'in',
    'notIn',
    'gt',
    'gte',
    'lt',
    'lte',
    'like',
    'contains',
] as const;

const OPERATOR_KEYS = new Set<string>(OPERATORS);

const RANGE_SQL = { gt: '>', gte: '>=', lt: '<', lte: '<=' } as const;

/** The escape character `contains` emits. */
const LIKE_ESCAPE = '\\';

/**
 * Compile a clause over `table`'s columns. `qualify` names each column as the
 * query refers to it, for a joined query that reads the table under an alias;
 * absent, the bare column name is used. An unknown column throws.
 */
export function compileWhere<D extends Table>(
    table: D,
    where: Where<D> | undefined,
    qualify: (column: string) => string = (column) => column
): WhereFn {
    const columns: Record<string, ColumnRuntime> = table.columns;
    const fail = (message: string): AstromechError =>
        new AstromechError(`createRepository("${table.name}"): ${message}`);

    function column(name: string): ColumnRuntime {
        const col = columns[name];
        if (!col) throw fail(`unknown column "${name}"`);
        return col;
    }

    function listOperand(
        key: string,
        op: string,
        col: ColumnRuntime,
        operand: unknown
    ): unknown[] {
        if (!Array.isArray(operand)) {
            throw fail(`"${op}" on column "${key}" expects an array`);
        }
        return (operand as unknown[]).map((item) => serialize(col, item));
    }

    /**
     * `contains` compiles to a raw fragment because Kysely's `like` operator
     * emits no ESCAPE clause, and without one a backslash is just a literal
     * character — the escaping would silently do nothing. `eb.ref` keeps the
     * column name under `CamelCasePlugin`, which does not transform raw text.
     */
    function containsCondition(
        eb: AnyExpressionBuilder,
        key: string,
        operand: unknown
    ): Expression<SqlBool> {
        if (typeof operand !== 'string') {
            throw fail(`"contains" on column "${key}" expects a string`);
        }
        const pattern = `%${escapeLikeText(operand)}%`;
        return sql<SqlBool>`${eb.ref(qualify(key))} like ${pattern} escape '\\'`;
    }

    function operatorConditions(
        eb: AnyExpressionBuilder,
        key: string,
        col: ColumnRuntime,
        ops: Record<string, unknown>
    ): Expression<SqlBool>[] {
        const ref = qualify(key);
        const out: Expression<SqlBool>[] = [];
        for (const [op, operand] of Object.entries(ops)) {
            if (operand === undefined) continue;
            switch (op) {
                case 'eq':
                    out.push(
                        operand === null
                            ? eb(ref, 'is', null)
                            : eb(ref, '=', serialize(col, operand))
                    );
                    break;
                case 'ne':
                    out.push(
                        operand === null
                            ? eb(ref, 'is not', null)
                            : eb(ref, '!=', serialize(col, operand))
                    );
                    break;
                case 'in':
                    out.push(eb(ref, 'in', listOperand(key, op, col, operand)));
                    break;
                case 'notIn':
                    out.push(eb(ref, 'not in', listOperand(key, op, col, operand)));
                    break;
                case 'gt':
                case 'gte':
                case 'lt':
                case 'lte':
                    out.push(eb(ref, RANGE_SQL[op], serialize(col, operand)));
                    break;
                case 'like':
                    // A LIKE pattern is a SQL literal, never a domain value.
                    out.push(eb(ref, 'like', operand));
                    break;
                case 'contains':
                    out.push(containsCondition(eb, key, operand));
                    break;
                default:
                    throw fail(`unknown operator "${op}" on column "${key}"`);
            }
        }
        return out;
    }

    function orBranches(value: unknown): Where<D>[] {
        if (!Array.isArray(value)) {
            throw fail(`"or" expects an array of where clauses`);
        }
        return value as Where<D>[];
    }

    function compile(clause: Where<D> | undefined): WhereFn {
        return (eb) => {
            const conditions: Expression<SqlBool>[] = [];
            for (const [key, value] of Object.entries(clause ?? {})) {
                // `undefined` means "no filter"; a deliberate `null` filters.
                if (value === undefined) continue;
                if (key === 'or') {
                    conditions.push(
                        eb.or(orBranches(value).map((branch) => compile(branch)(eb)))
                    );
                    continue;
                }
                const col = column(key);
                const ref = qualify(key);

                if (value === null) {
                    conditions.push(eb(ref, 'is', null));
                } else if (Array.isArray(value)) {
                    conditions.push(eb(ref, 'in', listOperand(key, 'in', col, value)));
                } else if (value instanceof Date) {
                    conditions.push(eb(ref, '=', serialize(col, value)));
                } else if (
                    typeof value === 'object' &&
                    isOperatorObject(col, value as object)
                ) {
                    conditions.push(
                        ...operatorConditions(
                            eb,
                            key,
                            col,
                            value as Record<string, unknown>
                        )
                    );
                } else {
                    conditions.push(eb(ref, '=', serialize(col, value)));
                }
            }
            // An empty list renders as an unfiltered query.
            return eb.and(conditions);
        };
    }

    return compile(where);
}

/** A value in its column form; `null` and `undefined` pass through. */
export function serialize(col: ColumnRuntime, value: unknown): unknown {
    if (value === null || value === undefined) return value;
    return col.serialize(value);
}

/**
 * `true` when a plain object should be read as `{ gte: …, like: … }` rather
 * than as the column's value. Column-kind-driven: a json column's domain
 * value IS an object, so operator detection never applies to one.
 */
function isOperatorObject(col: ColumnRuntime, value: object): boolean {
    if (col.kind === 'json') return false;
    const keys = Object.keys(value);
    return keys.length > 0 && keys.every((key) => OPERATOR_KEYS.has(key));
}

function escapeLikeText(text: string): string {
    return text.replace(/[\\%_]/g, (char) => `${LIKE_ESCAPE}${char}`);
}
