/**
 * Fluent field builders — each factory returns a FieldBuilder. Data props live
 * on the instance as own enumerable props; chainable setter methods live on the
 * prototype (non-enumerable), so spread and JSON.stringify emit only the data.
 * Call .build() to get a plain FieldDefinition.
 */

import type {
    AnyFieldType,
    BlockDefinition,
    FieldDefinition,
    SelectOption,
    ValidationRule,
} from '@/types/fields.js';

// ============================================================================
// Internal helpers
// ============================================================================

function setOwn(target: object, key: string, value: unknown): void {
    Object.defineProperty(target, key, {
        value,
        writable: true,
        configurable: true,
        enumerable: true,
    });
}

/** Define a non-enumerable method on a prototype. */
function proto(target: object, name: string, fn: object): void {
    Object.defineProperty(target, name, {
        value: fn,
        writable: true,
        configurable: true,
        enumerable: false,
    });
}

// ============================================================================
// Base runtime class (internal — public type is FieldBuilder interface below)
// ============================================================================

class FieldBuilderImpl {
    name: string;
    type: AnyFieldType;

    constructor(name: string, type: AnyFieldType) {
        this.name = name;
        this.type = type;
    }

    /**
     * Return a plain FieldDefinition clone. Own enumerable keys are copied;
     * nested builder instances in `fields` are recursively built.
     */
    build(): FieldDefinition {
        const plain: Record<string, unknown> = {};
        for (const key of Object.keys(this)) {
            const val = (this as unknown as Record<string, unknown>)[key];
            if (val === undefined) continue;
            if (key === 'fields' && Array.isArray(val)) {
                plain[key] = (val as (FieldDefinition | FieldBuilderImpl)[]).map(
                    normalizeFieldItem
                );
            } else {
                plain[key] = val;
            }
        }
        return plain as FieldDefinition;
    }
}

function normalizeFieldItem(f: FieldDefinition | FieldBuilderImpl): FieldDefinition {
    if (f instanceof FieldBuilderImpl) return f.build();
    return f;
}

// Base chainable methods (non-enumerable prototype props)
proto(FieldBuilderImpl.prototype, 'label', function (this: FieldBuilderImpl, s: string) {
    setOwn(this, 'label', s);
    return this;
});
proto(
    FieldBuilderImpl.prototype,
    'required',
    function (this: FieldBuilderImpl, v = true) {
        setOwn(this, 'required', v);
        return this;
    }
);
proto(
    FieldBuilderImpl.prototype,
    'default',
    function (this: FieldBuilderImpl, v: unknown) {
        setOwn(this, 'defaultValue', v);
        return this;
    }
);
proto(
    FieldBuilderImpl.prototype,
    'description',
    function (this: FieldBuilderImpl, s: string) {
        setOwn(this, 'description', s);
        return this;
    }
);
proto(
    FieldBuilderImpl.prototype,
    'validation',
    function (this: FieldBuilderImpl, ...rules: ValidationRule[]) {
        setOwn(this, 'validation', rules);
        return this;
    }
);
proto(
    FieldBuilderImpl.prototype,
    'translatable',
    function (this: FieldBuilderImpl, v = true) {
        setOwn(this, 'translatable', v);
        return this;
    }
);
proto(
    FieldBuilderImpl.prototype,
    'searchable',
    function (this: FieldBuilderImpl, v = true) {
        setOwn(this, 'searchable', v);
        return this;
    }
);

// ============================================================================
// Subclass runtime impls
// ============================================================================

class SelectBuilderImpl extends FieldBuilderImpl {
    constructor(name: string, type: AnyFieldType, opts?: string[] | SelectOption[]) {
        super(name, type);
        if (opts !== undefined) setOwn(this, 'options', opts);
    }
}
proto(
    SelectBuilderImpl.prototype,
    'options',
    function (this: SelectBuilderImpl, opts: string[] | SelectOption[]) {
        setOwn(this, 'options', opts);
        return this;
    }
);

class NumericBuilderImpl extends FieldBuilderImpl {}
proto(
    NumericBuilderImpl.prototype,
    'min',
    function (this: NumericBuilderImpl, n: number) {
        setOwn(this, 'min', n);
        return this;
    }
);
proto(
    NumericBuilderImpl.prototype,
    'max',
    function (this: NumericBuilderImpl, n: number) {
        setOwn(this, 'max', n);
        return this;
    }
);
proto(
    NumericBuilderImpl.prototype,
    'step',
    function (this: NumericBuilderImpl, n: number) {
        setOwn(this, 'step', n);
        return this;
    }
);

class ContainerBuilderImpl extends FieldBuilderImpl {}
proto(
    ContainerBuilderImpl.prototype,
    'fields',
    function (
        this: ContainerBuilderImpl,
        ...defs: (FieldDefinition | FieldBuilderImpl)[]
    ) {
        setOwn(this, 'fields', defs);
        return this;
    }
);
proto(
    ContainerBuilderImpl.prototype,
    'collapsed',
    function (this: ContainerBuilderImpl, v = true) {
        setOwn(this, 'collapsed', v);
        return this;
    }
);
proto(
    ContainerBuilderImpl.prototype,
    'tab',
    function (this: ContainerBuilderImpl, s: string) {
        setOwn(this, 'tab', s);
        return this;
    }
);

class BooleanBuilderImpl extends FieldBuilderImpl {}
proto(
    BooleanBuilderImpl.prototype,
    'checkboxLabel',
    function (this: BooleanBuilderImpl, s: string) {
        setOwn(this, 'checkboxLabel', s);
        return this;
    }
);

class MediaBuilderImpl extends FieldBuilderImpl {}
proto(
    MediaBuilderImpl.prototype,
    'multiple',
    function (this: MediaBuilderImpl, v = true) {
        setOwn(this, 'multiple', v);
        return this;
    }
);
proto(MediaBuilderImpl.prototype, 'accept', function (this: MediaBuilderImpl, s: string) {
    setOwn(this, 'accept', s);
    return this;
});

class RelationshipBuilderImpl extends FieldBuilderImpl {
    constructor(name: string, target?: string) {
        super(name, 'relationship');
        if (target !== undefined) setOwn(this, 'target', target);
    }
}
proto(
    RelationshipBuilderImpl.prototype,
    'target',
    function (this: RelationshipBuilderImpl, s: string) {
        setOwn(this, 'target', s);
        return this;
    }
);
proto(
    RelationshipBuilderImpl.prototype,
    'multiple',
    function (this: RelationshipBuilderImpl, v = true) {
        setOwn(this, 'multiple', v);
        return this;
    }
);
proto(
    RelationshipBuilderImpl.prototype,
    'inverse',
    function (this: RelationshipBuilderImpl, s: string) {
        setOwn(this, 'inverse', s);
        return this;
    }
);
proto(
    RelationshipBuilderImpl.prototype,
    'ordered',
    function (this: RelationshipBuilderImpl, v = true) {
        setOwn(this, 'ordered', v);
        return this;
    }
);
proto(
    RelationshipBuilderImpl.prototype,
    'onDelete',
    function (this: RelationshipBuilderImpl, v: 'cascade' | 'set-null' | 'restrict') {
        setOwn(this, 'onDelete', v);
        return this;
    }
);

class TabBuilderImpl extends FieldBuilderImpl {}
proto(
    TabBuilderImpl.prototype,
    'fields',
    function (this: TabBuilderImpl, ...defs: (FieldDefinition | FieldBuilderImpl)[]) {
        setOwn(this, 'fields', defs);
        return this;
    }
);

class RepeaterBuilderImpl extends FieldBuilderImpl {}
proto(
    RepeaterBuilderImpl.prototype,
    'fields',
    function (
        this: RepeaterBuilderImpl,
        ...defs: (FieldDefinition | FieldBuilderImpl)[]
    ) {
        setOwn(this, 'fields', defs);
        return this;
    }
);

class BlocksBuilderImpl extends FieldBuilderImpl {}
proto(
    BlocksBuilderImpl.prototype,
    'blocks',
    function (this: BlocksBuilderImpl, ...defs: BlockDefinition[]) {
        setOwn(this, 'blocks', defs);
        return this;
    }
);

// ============================================================================
// Public builder interfaces
// The interfaces carry only the chaining methods + name/type. They do NOT
// extend FieldDefinition to avoid naming conflicts (the builder method names
// overlap with FieldDefinition's data prop names). At runtime the builder IS
// structurally a FieldDefinition; use .build() to get a typed plain object.
// ============================================================================

/** Base fluent builder. Call .build() to get a plain FieldDefinition. */
export type FieldBuilder = {
    readonly name: string;
    readonly type: AnyFieldType;
    build(): FieldDefinition;
    label(s: string): FieldBuilder;
    required(v?: boolean): FieldBuilder;
    default(v: unknown): FieldBuilder;
    description(s: string): FieldBuilder;
    validation(...rules: ValidationRule[]): FieldBuilder;
    translatable(v?: boolean): FieldBuilder;
    searchable(v?: boolean): FieldBuilder;
};

/** Builder for select / multiselect / radio-group / checkbox-group. */
export type SelectFieldBuilder = FieldBuilder & {
    options(opts: string[] | SelectOption[]): SelectFieldBuilder;
};

/** Builder for number / range. */
export type NumericFieldBuilder = FieldBuilder & {
    min(n: number): NumericFieldBuilder;
    max(n: number): NumericFieldBuilder;
    step(n: number): NumericFieldBuilder;
};

/** Builder for group / accordion. */
export type ContainerFieldBuilder = FieldBuilder & {
    fields(...defs: (FieldDefinition | FieldBuilder)[]): ContainerFieldBuilder;
    collapsed(v?: boolean): ContainerFieldBuilder;
    tab(s: string): ContainerFieldBuilder;
};

/** Builder for boolean. */
export type BooleanFieldBuilder = FieldBuilder & {
    checkboxLabel(s: string): BooleanFieldBuilder;
};

/** Builder for media. */
export type MediaFieldBuilder = FieldBuilder & {
    multiple(v?: boolean): MediaFieldBuilder;
    accept(s: string): MediaFieldBuilder;
};

/** Builder for relationship. */
export type RelationshipFieldBuilder = FieldBuilder & {
    target(s: string): RelationshipFieldBuilder;
    multiple(v?: boolean): RelationshipFieldBuilder;
    inverse(s: string): RelationshipFieldBuilder;
    ordered(v?: boolean): RelationshipFieldBuilder;
    onDelete(v: 'cascade' | 'set-null' | 'restrict'): RelationshipFieldBuilder;
};

/** Builder for tab. */
export type TabFieldBuilder = FieldBuilder & {
    fields(...defs: (FieldDefinition | FieldBuilder)[]): TabFieldBuilder;
};

/** Builder for repeater. */
export type RepeaterFieldBuilder = FieldBuilder & {
    fields(...defs: (FieldDefinition | FieldBuilder)[]): RepeaterFieldBuilder;
};

/** Builder for blocks. */
export type BlocksFieldBuilder = FieldBuilder & {
    blocks(...defs: BlockDefinition[]): BlocksFieldBuilder;
};

// ============================================================================
// Type cast helper (internal)
// ============================================================================

function asBuilder<T>(x: FieldBuilderImpl): T {
    return x as unknown as T;
}

// ============================================================================
// Factory functions (public API)
// ============================================================================

export function text(name: string): FieldBuilder {
    return asBuilder(new FieldBuilderImpl(name, 'text'));
}

export function textarea(name: string): FieldBuilder {
    return asBuilder(new FieldBuilderImpl(name, 'textarea'));
}

export function richtext(name: string): FieldBuilder {
    return asBuilder(new FieldBuilderImpl(name, 'richtext'));
}

export function email(name: string): FieldBuilder {
    return asBuilder(new FieldBuilderImpl(name, 'email'));
}

export function url(name: string): FieldBuilder {
    return asBuilder(new FieldBuilderImpl(name, 'url'));
}

export function slug(name: string): FieldBuilder {
    return asBuilder(new FieldBuilderImpl(name, 'slug'));
}

export function color(name: string): FieldBuilder {
    return asBuilder(new FieldBuilderImpl(name, 'color'));
}

export function date(name: string): FieldBuilder {
    return asBuilder(new FieldBuilderImpl(name, 'date'));
}

export function datetime(name: string): FieldBuilder {
    return asBuilder(new FieldBuilderImpl(name, 'datetime'));
}

export function json(name: string): FieldBuilder {
    return asBuilder(new FieldBuilderImpl(name, 'json'));
}

export function link(name: string): FieldBuilder {
    return asBuilder(new FieldBuilderImpl(name, 'link'));
}

export function keyValue(name: string): FieldBuilder {
    return asBuilder(new FieldBuilderImpl(name, 'key-value'));
}

export function number(name: string): NumericFieldBuilder {
    return asBuilder(new NumericBuilderImpl(name, 'number'));
}

export function range(name: string): NumericFieldBuilder {
    return asBuilder(new NumericBuilderImpl(name, 'range'));
}

export function boolean(name: string): BooleanFieldBuilder {
    return asBuilder(new BooleanBuilderImpl(name, 'boolean'));
}

export function select(
    name: string,
    options?: string[] | SelectOption[]
): SelectFieldBuilder {
    return asBuilder(new SelectBuilderImpl(name, 'select', options));
}

export function multiselect(
    name: string,
    options?: string[] | SelectOption[]
): SelectFieldBuilder {
    return asBuilder(new SelectBuilderImpl(name, 'multiselect', options));
}

export function radioGroup(
    name: string,
    options?: string[] | SelectOption[]
): SelectFieldBuilder {
    return asBuilder(new SelectBuilderImpl(name, 'radio-group', options));
}

export function checkboxGroup(
    name: string,
    options?: string[] | SelectOption[]
): SelectFieldBuilder {
    return asBuilder(new SelectBuilderImpl(name, 'checkbox-group', options));
}

export function media(name: string): MediaFieldBuilder {
    return asBuilder(new MediaBuilderImpl(name, 'media'));
}

export function relationship(name: string, target?: string): RelationshipFieldBuilder {
    return asBuilder(new RelationshipBuilderImpl(name, target));
}

export function group(name: string): ContainerFieldBuilder {
    return asBuilder(new ContainerBuilderImpl(name, 'group'));
}

export function accordion(name: string): ContainerFieldBuilder {
    return asBuilder(new ContainerBuilderImpl(name, 'accordion'));
}

export function tab(name: string): TabFieldBuilder {
    return asBuilder(new TabBuilderImpl(name, 'tab'));
}

export function repeater(name: string): RepeaterFieldBuilder {
    return asBuilder(new RepeaterBuilderImpl(name, 'repeater'));
}

export function blocks(name: string): BlocksFieldBuilder {
    return asBuilder(new BlocksBuilderImpl(name, 'blocks'));
}
