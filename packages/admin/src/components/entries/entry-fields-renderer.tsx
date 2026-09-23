/**
 * Recursive field renderer for an entry's columns and a container's items. A
 * layout field draws a surface over its parent's values; a named `group`
 * scopes its children to its key. Data fields render through `FormField`.
 */

import type { DataField, Field, FieldPathSegment, LayoutField } from 'astromech';
import { formatInstancePath, isLayoutField } from 'astromech/shared';
import React from 'react';
import { useLabel } from '../../i18n/entry-namespace';
import { FieldValuesProvider } from '../fields/field-context';
import { useFieldError } from '../fields/field-errors-context';
import { FormField } from '../fields/form-field';
import { Collapsible } from '../ui/collapsible';
import { Stack } from '../ui/page';
import { Panel } from '../ui/panel';
import { Tabs } from '../ui/tabs';

/** The value object a run of fields reads and writes, and where it sits. */
type FieldScope = {
    values: Record<string, unknown>;
    /** Sets one key of `values`, by its bare field name. */
    onChange: (name: string, value: unknown) => void;
    /** Path from the root values to this scope. */
    segments: FieldPathSegment[];
};

/** A top-level column (the root or a tab body), or a list inside a surface. */
type RenderContext = 'column' | 'list';

type NodeProps = {
    scope: FieldScope;
    disabled?: boolean | undefined;
};

/**
 * Renders fields inside a panel, card or container item, as siblings with no
 * wrapper of their own, so the caller's surface sets the spacing.
 */
export function FieldList({
    nodes,
    scope,
    disabled,
}: { nodes: Field[] } & NodeProps): React.ReactElement {
    return (
        <>
            {nodes.map((node, i) => (
                <FieldNode
                    key={i}
                    node={node}
                    scope={scope}
                    context="list"
                    disabled={disabled}
                />
            ))}
        </>
    );
}

/**
 * Renders a column of fields over the root values. A structural field renders
 * standalone; a run of data fields is grouped into an implicit Panel, unless
 * `surface` is false, where loose fields render bare.
 */
export function EntryFieldColumn({
    nodes,
    values,
    onChange,
    disabled,
    surface = true,
}: {
    nodes: Field[];
    values: Record<string, unknown>;
    onChange: (name: string, value: unknown) => void;
    disabled?: boolean | undefined;
    surface?: boolean;
}): React.ReactElement {
    // Expose the root values to any descendant that reads sibling fields
    // (e.g. a computed/preview field) via `useFieldValue`.
    return (
        <FieldValuesProvider values={values}>
            <FieldColumn
                nodes={nodes}
                scope={{ values, onChange, segments: [] }}
                disabled={disabled}
                surface={surface}
            />
        </FieldValuesProvider>
    );
}

type ColumnItem = { node: Field; scope: FieldScope };

function FieldColumn({
    nodes,
    scope,
    disabled,
    surface,
}: { nodes: Field[]; surface: boolean } & NodeProps): React.ReactElement {
    const blocks: React.ReactNode[] = [];
    let buffer: ColumnItem[] = [];

    const flush = (key: string): void => {
        if (buffer.length === 0) return;
        const buffered = buffer;
        buffer = [];
        const list = (
            <Stack gap={5}>
                {buffered.map((item, i) => (
                    <FieldNode
                        key={i}
                        node={item.node}
                        scope={item.scope}
                        context="list"
                        disabled={disabled}
                    />
                ))}
            </Stack>
        );
        blocks.push(
            surface ? (
                <Panel key={`panel-${key}`}>{list}</Panel>
            ) : (
                <React.Fragment key={`bare-${key}`}>{list}</React.Fragment>
            )
        );
    };

    columnItems(nodes, scope).forEach((item, i) => {
        if (isLayoutField(item.node) || item.node.type === 'group') {
            flush(String(i));
            blocks.push(
                <FieldNode
                    key={`node-${i}`}
                    node={item.node}
                    scope={item.scope}
                    context="column"
                    disabled={disabled}
                />
            );
        } else {
            buffer.push(item);
        }
    });
    flush('tail');

    return <>{blocks}</>;
}

/** A column's nodes, with each unboxed named group opened in place over its key. */
function columnItems(nodes: Field[], scope: FieldScope): ColumnItem[] {
    return nodes.flatMap((node) =>
        !isLayoutField(node) && node.type === 'group' && node.boxed === false
            ? columnItems(node.fields ?? [], childScope(scope, node.name))
            : [{ node, scope }]
    );
}

function FieldNode({
    node,
    scope,
    context,
    disabled,
}: { node: Field; context: RenderContext } & NodeProps): React.ReactElement {
    if (isLayoutField(node)) {
        return (
            <LayoutNode node={node} scope={scope} context={context} disabled={disabled} />
        );
    }
    if (node.type === 'group' && context === 'column') {
        return <GroupPanel node={node} scope={scope} disabled={disabled} />;
    }
    return (
        <FormField
            field={node}
            value={scope.values[node.name]}
            name={formatInstancePath([
                ...scope.segments,
                { kind: 'field', name: node.name },
            ])}
            // `name` is the full path (error lookup, sibling reads); the scope
            // keys its values by the BARE field name, so the reported name is dropped.
            onChange={(_path, value) => scope.onChange(node.name, value)}
            disabled={disabled ?? false}
        />
    );
}

function LayoutNode({
    node,
    scope,
    context,
    disabled,
}: { node: LayoutField; context: RenderContext } & NodeProps): React.ReactElement {
    const label = useLabel();
    const title = node.label !== undefined ? label(node.label, '') : undefined;

    if (node.type === 'tabs') {
        return <TabsContainer node={node} scope={scope} disabled={disabled} />;
    }

    if (node.type === 'accordion') {
        return (
            <Collapsible label={title ?? ''} defaultOpen={node.collapsed !== true}>
                <Stack gap={5}>
                    <FieldList nodes={node.fields} scope={scope} disabled={disabled} />
                </Stack>
            </Collapsible>
        );
    }

    if (node.type === 'group') {
        const description =
            node.description !== undefined ? label(node.description, '') : undefined;
        if (context === 'column') {
            return (
                <Panel
                    {...(title !== undefined && { title })}
                    {...(description !== undefined && { description })}
                >
                    <Stack gap={5}>
                        <FieldList
                            nodes={node.fields}
                            scope={scope}
                            disabled={disabled}
                        />
                    </Stack>
                </Panel>
            );
        }
        return (
            <GroupCard title={title} description={description}>
                <FieldList nodes={node.fields} scope={scope} disabled={disabled} />
            </GroupCard>
        );
    }

    // Defensive: a `tab` only renders inside `tabs`; treat it as a passthrough.
    return (
        <Stack gap={5}>
            <FieldList nodes={node.fields} scope={scope} disabled={disabled} />
        </Stack>
    );
}

/**
 * A named, boxed group in a column: a titled Panel over the group's own key.
 * It draws no `FieldWrapper`, so it shows the group's own error itself.
 */
function GroupPanel({
    node,
    scope,
    disabled,
}: { node: DataField } & NodeProps): React.ReactElement {
    const label = useLabel();
    const error = useFieldError(
        formatInstancePath([...scope.segments, { kind: 'field', name: node.name }])
    );
    return (
        <Panel
            title={label(node.label, node.name)}
            {...(node.description !== undefined && {
                description: label(node.description, node.name),
            })}
        >
            <Stack gap={5}>
                {error !== undefined && error.length > 0 && (
                    <p className="am-field-error">{error[0]}</p>
                )}
                <FieldList
                    nodes={node.fields ?? []}
                    scope={childScope(scope, node.name)}
                    disabled={disabled}
                />
            </Stack>
        </Panel>
    );
}

/** An unnamed group inside a list: the card a named group draws, with no data key. */
function GroupCard({
    title,
    description,
    children,
}: {
    title: string | undefined;
    description: string | undefined;
    children: React.ReactNode;
}): React.ReactElement {
    const card = <div className="am-group-field am-group-field--boxed">{children}</div>;
    if (title === undefined && description === undefined) return card;
    return (
        <div className="am-field">
            {title !== undefined && <span className="am-field-label">{title}</span>}
            {description !== undefined && <p className="am-field-hint">{description}</p>}
            {card}
        </div>
    );
}

function TabsContainer({
    node,
    scope,
    disabled,
}: { node: LayoutField } & NodeProps): React.ReactElement | null {
    const label = useLabel();
    const tabNodes = node.fields;
    const [active, setActive] = React.useState('0');

    if (tabNodes.length === 0) return null;

    // Tabs render at the root with no wrapping surface. Their content (often
    // groups) brings its own surfaces.
    return (
        <Tabs
            tabs={tabNodes.map((tabNode, i) => ({
                label: tabNode.label !== undefined ? label(tabNode.label, '') : '',
                value: String(i),
            }))}
            value={active}
            onChange={setActive}
            renderPanel={(value) => {
                const tabNode = tabNodes[Number(value)];
                if (tabNode === undefined || !isLayoutField(tabNode)) return null;
                // A tab's body is a top-level column (like the root main
                // column), not a list of fields inside one panel, so groups get
                // the root rhythm rather than the within-panel field gap.
                return (
                    <Stack gap={8}>
                        <FieldColumn
                            nodes={tabNode.fields}
                            scope={scope}
                            disabled={disabled}
                            surface={false}
                        />
                    </Stack>
                );
            }}
        />
    );
}

/** The scope a named group's children read and write: its key in `scope`. */
function childScope(scope: FieldScope, name: string): FieldScope {
    const raw = scope.values[name];
    const values =
        typeof raw === 'object' && raw !== null && !Array.isArray(raw)
            ? (raw as Record<string, unknown>)
            : {};
    return {
        values,
        onChange: (childName, value) =>
            scope.onChange(name, { ...values, [childName]: value }),
        segments: [...scope.segments, { kind: 'field', name }],
    };
}
