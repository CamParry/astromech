/**
 * Reusable field-tree form body.
 *
 * Renders a `ResolvedEntryFields` tree (main + optional sidebar) using the
 * same `EntryFieldColumn` renderer the entry-edit page uses, so layout
 * containers (section, accordion, tabs), groups, repeaters, and blocks all
 * work out of the box.
 *
 * Callers own state (`values` / `onChange`) and disabled logic.
 */

import React from 'react';
import type { ResolvedEntryFields } from '@/types/index.js';
import {
    FormLayout,
    FormLayoutContent,
    Stack,
} from '@/admin/components/ui/index.js';
import { EntryFieldColumn } from '@/admin/components/entries/entry-fields-renderer.js';

export type FieldTreeFormProps = {
    fields: ResolvedEntryFields;
    values: Record<string, unknown>;
    onChange: (name: string, value: unknown) => void;
    disabled?: boolean;
};

export function FieldTreeForm({
    fields,
    values,
    onChange,
    disabled = false,
}: FieldTreeFormProps): React.ReactElement {
    const hasSidebar = fields.sidebar.length > 0;

    if (!hasSidebar) {
        // Mirror the entry edit page's main column so sections get the same
        // vertical rhythm (the block-stack gap).
        return (
            <Stack gap={8}>
                <EntryFieldColumn
                    nodes={fields.main}
                    values={values}
                    onChange={onChange}
                    disabled={disabled}
                />
            </Stack>
        );
    }

    return (
        <FormLayout>
            <FormLayoutContent>
                <Stack gap={8}>
                    <EntryFieldColumn
                        nodes={fields.main}
                        values={values}
                        onChange={onChange}
                        disabled={disabled}
                    />
                </Stack>
                <Stack gap={8}>
                    <EntryFieldColumn
                        nodes={fields.sidebar}
                        values={values}
                        onChange={onChange}
                        disabled={disabled}
                    />
                </Stack>
            </FormLayoutContent>
        </FormLayout>
    );
}
