/**
 * One field value of an admin resource row, as a list cell shows it: a date
 * formatted, a boolean as a tick, an option as its label, and an empty value as a dash.
 */

import type { DataField, SelectOption } from 'astromech';
import { Check } from 'lucide-react';
import React from 'react';
import { useLabel } from '../../i18n/entry-namespace';
import { formatDate, formatDatetime } from '../../utilities/dates';

export type AdminResourceValueProps = {
    field: DataField;
    value: unknown;
};

export function AdminResourceValue({
    field,
    value,
}: AdminResourceValueProps): React.ReactElement {
    const label = useLabel();

    if (field.type === 'boolean') {
        return value === true ? <Check size={14} /> : <Empty />;
    }
    if (value === null || value === undefined || value === '') return <Empty />;

    if (field.type === 'date' || field.type === 'datetime') {
        const format = field.type === 'date' ? formatDate : formatDatetime;
        return (
            <span className="am-text-sm am-text-muted">
                {format(value as Date | string)}
            </span>
        );
    }

    if (field.options !== undefined) {
        const options = field.options.map(
            (option): SelectOption =>
                typeof option === 'string' ? { value: option, label: option } : option
        );
        const optionLabel = (item: unknown): string => {
            const option = options.find((candidate) => candidate.value === item);
            return option === undefined
                ? String(item)
                : label(option.label, option.value);
        };
        return (
            <>{(Array.isArray(value) ? value : [value]).map(optionLabel).join(', ')}</>
        );
    }

    return <>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</>;
}

function Empty(): React.ReactElement {
    return <span className="am-text-muted">—</span>;
}
