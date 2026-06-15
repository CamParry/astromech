/**
 * Recursive entry field renderer.
 *
 * Renders a column (`main`/`sidebar`) of the entry field tree. Layout
 * containers are pure chrome over a FLAT data model — `section` (Panel),
 * `accordion` (Collapsible), `tabs`/`tab` (tab strip) — so their children read
 * and write top-level data keys via the same flat `values`/`onChange`. Data
 * containers (`group`/`repeater`/`blocks`) and leaf fields render through
 * `FormField`, which owns their own (possibly nested) value.
 *
 * At the column root, a run of consecutive non-layout fields is wrapped in an
 * implicit `Panel`; layout containers render as standalone blocks.
 */

import React from 'react';
import type { FieldDefinition } from '@/types/index.js';
import { Panel, Tabs, Collapsible, Stack } from '@/admin/components/ui/index.js';
import { FormField } from '@/admin/components/fields/form-field.js';
import { FieldValuesProvider } from '@/admin/components/fields/field-context.js';
import { useLabel } from '@/admin/i18n/entry-namespace.js';

const LAYOUT_TYPES = new Set(['section', 'tabs', 'tab', 'accordion']);

type RenderProps = {
    values: Record<string, unknown>;
    onChange: (name: string, value: unknown) => void;
    disabled?: boolean | undefined;
};

/** A list of fields already inside a panel/container surface. */
function FieldList({
    nodes,
    ...props
}: { nodes: FieldDefinition[] } & RenderProps): React.ReactElement {
    return (
        <Stack gap={5}>
            {nodes.map((node, i) => (
                <FieldNode
                    key={`${node.type}-${node.name}-${i}`}
                    node={node}
                    {...props}
                />
            ))}
        </Stack>
    );
}

function FieldNode({
    node,
    values,
    onChange,
    disabled,
}: { node: FieldDefinition } & RenderProps): React.ReactElement {
    const label = useLabel();

    if (node.type === 'section') {
        return (
            <Panel
                title={label(node.label, node.name)}
                {...(node.description !== undefined && {
                    description: label(node.description, node.name),
                })}
            >
                <FieldList
                    nodes={node.fields ?? []}
                    values={values}
                    onChange={onChange}
                    disabled={disabled}
                />
            </Panel>
        );
    }

    if (node.type === 'accordion') {
        return (
            <Collapsible
                label={label(node.label, node.name)}
                defaultOpen={node.collapsed !== true}
            >
                <FieldList
                    nodes={node.fields ?? []}
                    values={values}
                    onChange={onChange}
                    disabled={disabled}
                />
            </Collapsible>
        );
    }

    if (node.type === 'tabs') {
        return (
            <TabsContainer
                node={node}
                values={values}
                onChange={onChange}
                disabled={disabled}
            />
        );
    }

    if (node.type === 'tab') {
        // Defensive: a `tab` only renders inside `tabs`; treat as a passthrough.
        return (
            <FieldList
                nodes={node.fields ?? []}
                values={values}
                onChange={onChange}
                disabled={disabled}
            />
        );
    }

    return (
        <FormField
            field={node}
            value={values[node.name]}
            onChange={onChange}
            disabled={disabled ?? false}
        />
    );
}

function TabsContainer({
    node,
    values,
    onChange,
    disabled,
}: { node: FieldDefinition } & RenderProps): React.ReactElement | null {
    const label = useLabel();
    const tabNodes = node.fields ?? [];
    const [active, setActive] = React.useState(tabNodes[0]?.name ?? '');

    if (tabNodes.length === 0) return null;

    // Tabs render at the root with no wrapping surface — author wraps them in a
    // `section` when a container is wanted. Their content (often sections) brings
    // its own surfaces.
    return (
        <Tabs
            tabs={tabNodes.map((tabNode) => ({
                label: label(tabNode.label, tabNode.name),
                value: tabNode.name,
            }))}
            value={active}
            onChange={setActive}
            renderPanel={(value) => {
                const tabNode = tabNodes.find((tn) => tn.name === value);
                if (!tabNode) return null;
                // A tab's body is a top-level block column (like the root main
                // column), not a list of fields inside one panel — render it
                // through the same column renderer so sections get the root 2rem
                // rhythm rather than the within-panel field gap.
                return (
                    <Stack gap={8}>
                        <EntryFieldColumn
                            nodes={tabNode.fields ?? []}
                            values={values}
                            onChange={onChange}
                            disabled={disabled}
                            surface={false}
                        />
                    </Stack>
                );
            }}
        />
    );
}

/**
 * Render a column of fields. Layout containers render standalone; a run of
 * consecutive non-layout fields is grouped into an implicit Panel — unless
 * `surface` is false (tab bodies), where loose fields render bare and the author
 * nests a `section` when a surface is wanted.
 */
export function EntryFieldColumn({
    nodes,
    values,
    onChange,
    disabled,
    surface = true,
}: { nodes: FieldDefinition[]; surface?: boolean } & RenderProps): React.ReactElement {
    const blocks: React.ReactNode[] = [];
    let buffer: FieldDefinition[] = [];

    const flush = (key: string): void => {
        if (buffer.length === 0) return;
        const bufferedNodes = buffer;
        buffer = [];
        const list = (
            <FieldList
                nodes={bufferedNodes}
                values={values}
                onChange={onChange}
                disabled={disabled}
            />
        );
        blocks.push(
            surface ? (
                <Panel key={`panel-${key}`}>{list}</Panel>
            ) : (
                <React.Fragment key={`bare-${key}`}>{list}</React.Fragment>
            )
        );
    };

    nodes.forEach((node, i) => {
        if (LAYOUT_TYPES.has(node.type)) {
            flush(String(i));
            blocks.push(
                <FieldNode
                    key={`${node.type}-${node.name}-${i}`}
                    node={node}
                    values={values}
                    onChange={onChange}
                    disabled={disabled}
                />
            );
        } else {
            buffer.push(node);
        }
    });
    flush('tail');

    // Expose the root values to any descendant that reads sibling fields
    // (e.g. a computed/preview field) via `useFieldValue`. The same root object
    // flows to both columns and through layout containers (flat data model).
    return <FieldValuesProvider values={values}>{blocks}</FieldValuesProvider>;
}
