/**
 * `defineTable` — the table definition primitive. One `Table` yields domain
 * row types (`TableSelect`/`TableInsert`/`TableUpdate`) and Kysely encoded
 * types (`KyselyOf`), plus the per-column codec `database/codec.ts` drives.
 */

import type { ColumnType, Generated } from 'kysely';
import { ulid } from 'ulidx';

export type ColumnKind =
    | 'id'
    | 'text'
    | 'integer'
    | 'real'
    | 'boolean'
    | 'timestamp'
    | 'json'
    | 'enum'
    | 'reference';

export type OnDelete = 'cascade' | 'no action' | 'set null';

/** A reference target: another `Table`, or a string name for a hand-typed
 *  (non-`defineTable`) table such as `users`. Lazy so self/forward references
 *  resolve after the referencing table is assigned. */
export type ReferenceTarget = Table | string;

export type ReferenceSpec = {
    target: () => ReferenceTarget;
    onDelete: OnDelete;
};

export type ColumnRuntime = {
    kind: ColumnKind;
    notNull: boolean;
    primaryKey: boolean;
    unique: boolean;
    /** SQL-literal DEFAULT (text/integer/real/boolean/enum). The DB fills it. */
    sqlDefault?: string | number | boolean;
    /** App-generated default (id/defaultUlid → 'ulid' or 'uuid', timestamp
     *  defaultNow → 'now'). */
    appDefault?: 'ulid' | 'uuid' | 'now';
    /** Timestamp stamped on every update (callers stamp explicitly today). */
    onUpdate: boolean;
    enumValues?: readonly string[];
    reference?: ReferenceSpec;
    /** JS (domain) → encoded. */
    serialize: (v: unknown) => unknown;
    /** Encoded → JS (domain). */
    parse: (v: unknown) => unknown;
    /** Produce an app default (domain value); serialize runs afterwards. */
    default?: () => unknown;
};

export type IndexSpec = {
    name: string;
    columns: string[];
    unique: boolean;
    where?: string;
};

// Phantom column config — encodes the type facts for inference
type ColConfig = {
    /** Domain type (Date, parsed object, boolean, string, number). */
    data: unknown;
    /** Encoded type the Kysely layer sees (ISO string, JSON string, 0/1, …). */
    encoded: unknown;
    /** NOT NULL (or primary key). */
    notNull: boolean;
    /** App-generated default present → omittable on insert, auto-filled. */
    generated: boolean;
    /** SQL DEFAULT present → omittable on insert. */
    hasDefault: boolean;
};

/** A column: the runtime shape plus a phantom config for inference. */
export type Column<C extends ColConfig = ColConfig> = ColumnRuntime & {
    readonly __config?: C;
};

export type AnyCols = Record<string, Column>;

type Or<A, B> = A extends true ? true : B extends true ? true : false;
type Not<A> = A extends true ? false : true;
/**
 * `true` iff `O` carries `K: true`. Uses `O extends Record<K, true>` rather than
 * `O[K] extends true` so it stays correct when an unprovided `const O` widens to
 * its constraint or an empty default whose `keyof` is `string`.
 */
type FlagTrue<O, K extends PropertyKey> = O extends Record<K, true> ? true : false;
/** `true` iff `O` carries key `K` with a concrete (non-`undefined`) value. */
type HasKey<O, K extends PropertyKey> =
    O extends Record<K, infer V> ? (undefined extends V ? false : true) : false;
type Prettify<T> = { [K in keyof T]: T[K] } & {};

type TextOpts = {
    notNull?: boolean;
    unique?: boolean;
    primaryKey?: boolean;
    default?: string;
    /** App-generated ULID default for a plain text column (e.g. localeGroup). */
    defaultUlid?: boolean;
};
type IntegerOpts = {
    notNull?: boolean;
    unique?: boolean;
    primaryKey?: boolean;
    default?: number;
};
type RealOpts = {
    notNull?: boolean;
    default?: number;
};
type BooleanOpts = {
    notNull?: boolean;
    default?: boolean;
};
type IdOpts = {
    /** Format of the id the app default mints — ULID by default, uuid for a
     *  table another writer (better-auth) also inserts into. That writer mints
     *  ids in its own format; the column is text either way. */
    format?: 'ulid' | 'uuid';
};
type TimestampOpts = {
    notNull?: boolean;
    defaultNow?: boolean;
    onUpdate?: boolean;
};
type EnumOpts<V extends string> = {
    notNull?: boolean;
    default?: V;
};
type RefOpts = {
    notNull?: boolean;
    onDelete?: OnDelete;
};

// Per-kind config derivations.
type TextConfig<O extends TextOpts> = {
    data: string;
    encoded: string;
    notNull: Or<FlagTrue<O, 'notNull'>, FlagTrue<O, 'primaryKey'>>;
    generated: FlagTrue<O, 'defaultUlid'>;
    hasDefault: HasKey<O, 'default'>;
};
type IntegerConfig<O extends IntegerOpts> = {
    data: number;
    encoded: number;
    notNull: Or<FlagTrue<O, 'notNull'>, FlagTrue<O, 'primaryKey'>>;
    generated: false;
    hasDefault: HasKey<O, 'default'>;
};
type RealConfig<O extends RealOpts> = {
    data: number;
    encoded: number;
    notNull: FlagTrue<O, 'notNull'>;
    generated: false;
    hasDefault: HasKey<O, 'default'>;
};
type BooleanConfig<O extends BooleanOpts> = {
    data: boolean;
    encoded: number;
    notNull: FlagTrue<O, 'notNull'>;
    generated: false;
    hasDefault: HasKey<O, 'default'>;
};
type TimestampConfig<O extends TimestampOpts> = {
    data: Date;
    encoded: string;
    notNull: FlagTrue<O, 'notNull'>;
    generated: FlagTrue<O, 'defaultNow'>;
    hasDefault: false;
};
type EnumConfig<V extends readonly string[], O extends EnumOpts<V[number]>> = {
    data: V[number];
    encoded: V[number];
    notNull: FlagTrue<O, 'notNull'>;
    generated: false;
    hasDefault: HasKey<O, 'default'>;
};
type RefConfig<O extends RefOpts> = {
    data: string;
    encoded: string;
    notNull: FlagTrue<O, 'notNull'>;
    generated: false;
    hasDefault: false;
};

// Codec primitives — the encoded format flip lives here
const passthrough = (v: unknown): unknown => v;
// Always stringify: a JSON column whose value *is* a string (`settings.set(k,
// 'a-string')`) must still round-trip, and `jsonParse` unconditionally parses.
// Passing strings through unchanged made that case throw on read.
const jsonSerialize = (v: unknown): unknown => JSON.stringify(v);
const jsonParse = (v: unknown): unknown => (typeof v === 'string' ? JSON.parse(v) : v);
const boolSerialize = (v: unknown): unknown => (v ? 1 : 0);
const boolParse = (v: unknown): unknown => Number(v) === 1;
const isoSerialize = (v: unknown): unknown => (v instanceof Date ? v.toISOString() : v);
const isoParse = (v: unknown): unknown =>
    // A number here is a unix-seconds value written by an older `users` row,
    // back when that table encoded seconds. Tolerated so those rows still
    // decode; every writer produces ISO now.
    typeof v === 'number' ? new Date(v * 1000) : new Date(v as string);

function id(o?: IdOpts): Column<{
    data: string;
    encoded: string;
    notNull: true;
    generated: true;
    hasDefault: false;
}> {
    const uuid = o?.format === 'uuid';
    return {
        kind: 'id',
        notNull: true,
        primaryKey: true,
        unique: false,
        appDefault: uuid ? 'uuid' : 'ulid',
        onUpdate: false,
        serialize: passthrough,
        parse: passthrough,
        default: uuid ? () => crypto.randomUUID() : () => ulid(),
    };
}

function text<const O extends TextOpts = Record<never, never>>(
    o?: O
): Column<TextConfig<O>> {
    return {
        kind: 'text',
        notNull: !!(o?.notNull || o?.primaryKey),
        primaryKey: !!o?.primaryKey,
        unique: !!o?.unique,
        ...(o?.default !== undefined && { sqlDefault: o.default }),
        ...(o?.defaultUlid && { appDefault: 'ulid' as const }),
        onUpdate: false,
        serialize: passthrough,
        parse: passthrough,
        ...(o?.defaultUlid && { default: () => ulid() }),
    };
}

function integer<const O extends IntegerOpts = Record<never, never>>(
    o?: O
): Column<IntegerConfig<O>> {
    return {
        kind: 'integer',
        notNull: !!(o?.notNull || o?.primaryKey),
        primaryKey: !!o?.primaryKey,
        unique: !!o?.unique,
        ...(o?.default !== undefined && { sqlDefault: o.default }),
        onUpdate: false,
        serialize: passthrough,
        parse: passthrough,
    };
}

function real<const O extends RealOpts = Record<never, never>>(
    o?: O
): Column<RealConfig<O>> {
    return {
        kind: 'real',
        notNull: !!o?.notNull,
        primaryKey: false,
        unique: false,
        ...(o?.default !== undefined && { sqlDefault: o.default }),
        onUpdate: false,
        serialize: passthrough,
        parse: passthrough,
    };
}

function boolean<const O extends BooleanOpts = Record<never, never>>(
    o?: O
): Column<BooleanConfig<O>> {
    return {
        kind: 'boolean',
        notNull: !!o?.notNull,
        primaryKey: false,
        unique: false,
        ...(o?.default !== undefined && { sqlDefault: o.default ? 1 : 0 }),
        onUpdate: false,
        serialize: boolSerialize,
        parse: boolParse,
    };
}

function timestamp<const O extends TimestampOpts = Record<never, never>>(
    o?: O
): Column<TimestampConfig<O>> {
    return {
        kind: 'timestamp',
        notNull: !!o?.notNull,
        primaryKey: false,
        unique: false,
        ...(o?.defaultNow && { appDefault: 'now' as const }),
        onUpdate: !!o?.onUpdate,
        serialize: isoSerialize,
        parse: isoParse,
        ...(o?.defaultNow && { default: () => new Date() }),
    };
}

// JSON uses overloads so an explicit data generic (`col.json<string[]>(...)`)
// composes with notNull selection via the argument — a single `<T, O>` signature
// would drop O to its default once T is given explicitly.
function json<T = unknown>(o: {
    notNull: true;
}): Column<{
    data: T;
    encoded: string;
    notNull: true;
    generated: false;
    hasDefault: false;
}>;
function json<T = unknown>(o?: {
    notNull?: false;
}): Column<{
    data: T;
    encoded: string;
    notNull: false;
    generated: false;
    hasDefault: false;
}>;
function json(o?: { notNull?: boolean }): Column<ColConfig> {
    return {
        kind: 'json',
        notNull: !!o?.notNull,
        primaryKey: false,
        unique: false,
        onUpdate: false,
        serialize: jsonSerialize,
        parse: jsonParse,
    } as Column<ColConfig>;
}

function enum_<
    const V extends readonly string[],
    const O extends EnumOpts<V[number]> = Record<never, never>,
>(values: V, o?: O): Column<EnumConfig<V, O>> {
    return {
        kind: 'enum',
        notNull: !!o?.notNull,
        primaryKey: false,
        unique: false,
        enumValues: values,
        ...(o?.default !== undefined && { sqlDefault: o.default }),
        onUpdate: false,
        serialize: passthrough,
        parse: passthrough,
    };
}

function reference<const O extends RefOpts = Record<never, never>>(
    target: ReferenceTarget | (() => ReferenceTarget),
    o?: O
): Column<RefConfig<O>> {
    const resolve: () => ReferenceTarget =
        typeof target === 'function' ? target : () => target;
    return {
        kind: 'reference',
        notNull: !!o?.notNull,
        primaryKey: false,
        unique: false,
        onUpdate: false,
        reference: { target: resolve, onDelete: o?.onDelete ?? 'no action' },
        serialize: passthrough,
        parse: passthrough,
    };
}

export type ColFactory = {
    id: typeof id;
    text: typeof text;
    integer: typeof integer;
    real: typeof real;
    boolean: typeof boolean;
    timestamp: typeof timestamp;
    json: typeof json;
    enum: typeof enum_;
    reference: typeof reference;
};

const col: ColFactory = {
    id,
    text,
    integer,
    real,
    boolean,
    timestamp,
    json,
    enum: enum_,
    reference,
};

function index(
    name: string,
    columns: string[],
    opts?: { unique?: boolean; where?: string }
): IndexSpec {
    return {
        name,
        columns,
        unique: !!opts?.unique,
        ...(opts?.where !== undefined && { where: opts.where }),
    };
}

/** The `index` helper handed to a `defineTable` indexes callback. */
export type IndexFactory = typeof index;

/**
 * `N` carries the SQL table name as a literal so downstream types can derive
 * the Kysely (CamelCasePlugin) key from it — see `PluginDB` in
 * `define-plugin.ts`. It defaults to `string`, so `Table` and
 * `Table<Cols>` keep working unchanged as loose annotations.
 */
export type Table<C extends AnyCols = AnyCols, N extends string = string> = {
    name: N;
    columns: C;
    /** Table-level composite primary key, in key order (column keys, not
     *  snake_case column names). A single-column key stays `col.x({ primaryKey:
     *  true })` — this is only for keys spanning more than one column. */
    primaryKey?: string[];
    indexes: IndexSpec[];
};

type IndexesFn = (helpers: { index: IndexFactory }) => IndexSpec[];

/** The third `defineTable` argument in its object form — the indexes callback
 *  plus anything that needs naming, which a bare callback has no room for. */
export type TableOptions<C extends AnyCols> = {
    indexes?: IndexesFn;
    primaryKey?: (keyof C & string)[];
};

export function defineTable<const C extends AnyCols, const N extends string>(
    name: N,
    cols: (helpers: { col: ColFactory }) => C,
    indexesOrOptions?: IndexesFn | TableOptions<C>
): Table<C, N> {
    const options: TableOptions<C> =
        typeof indexesOrOptions === 'function'
            ? { indexes: indexesOrOptions }
            : (indexesOrOptions ?? {});
    return {
        name,
        columns: cols({ col }),
        ...(options.primaryKey !== undefined && { primaryKey: options.primaryKey }),
        indexes: options.indexes ? options.indexes({ index }) : [],
    };
}

type ConfigOf<T> = T extends Column<infer C> ? C : never;
type DomainData<T> = ConfigOf<T>['data'];
type EncodedData<T> = ConfigOf<T>['encoded'];
type IsNotNull<T> = ConfigOf<T>['notNull'] extends true ? true : false;
type IsGenerated<T> = ConfigOf<T>['generated'] extends true ? true : false;
type HasDefaultCol<T> = ConfigOf<T>['hasDefault'] extends true ? true : false;

/** Domain select cell: data, nullable unless NOT NULL. */
type DomainSelectCell<T> =
    IsNotNull<T> extends true ? DomainData<T> : DomainData<T> | null;

/** Omittable on a domain insert: app/SQL default, or nullable. */
type DomainOptional<T> = Or<Or<IsGenerated<T>, HasDefaultCol<T>>, Not<IsNotNull<T>>>;

/** Encoded select cell: encoded type, nullable unless NOT NULL. */
type EncodedCellBase<T> =
    IsNotNull<T> extends true ? EncodedData<T> : EncodedData<T> | null;

/** Kysely cell: `Generated<>` for app/SQL-defaulted columns (omittable on insert). */
type KyselyCell<T> =
    Or<IsGenerated<T>, HasDefaultCol<T>> extends true
        ? Generated<EncodedCellBase<T>>
        : EncodedCellBase<T>;

type ColsOf<D> = D extends Table<infer C, string> ? C : never;

/** Domain row as selected — `Date`/parsed-object/`boolean` shapes. */
export type TableSelect<D> = Prettify<{
    [K in keyof ColsOf<D>]: DomainSelectCell<ColsOf<D>[K]>;
}>;

/** Domain insert — required columns plus optional (defaulted/nullable) ones. */
export type TableInsert<D> = Prettify<
    {
        [K in keyof ColsOf<D> as DomainOptional<ColsOf<D>[K]> extends true
            ? never
            : K]: DomainData<ColsOf<D>[K]>;
    } & {
        [K in keyof ColsOf<D> as DomainOptional<ColsOf<D>[K]> extends true
            ? K
            : never]?: DomainSelectCell<ColsOf<D>[K]>;
    }
>;

export type TableUpdate<D> = Partial<TableInsert<D>>;

/** The Kysely table type for the `DB` interface — encoded shapes + `Generated<>`. */
export type KyselyOf<D> = {
    [K in keyof ColsOf<D>]: KyselyCell<ColsOf<D>[K]>;
};

// Re-export ColumnType for assemblers that need it (kept for parity / future use).
export type { ColumnType };
