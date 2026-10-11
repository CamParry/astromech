import type { BaseFieldProps } from 'astromech';
import { useEffect, useRef } from 'react';
import {
    datetimeFromInput,
    datetimeInputValue,
    hasZone,
} from '../../utilities/formatters';
import { Input } from '../ui/input';
import { useFieldControl } from './field-control-context';

/**
 * A `datetime-local` input. A value stored with a zone shows in the editor's
 * local time and an edit is sent back as UTC; a wall time is shown and sent as
 * it is. A value the editor does not touch is never sent through `onChange`,
 * so the form saves it unchanged.
 */
export function DatetimeField({
    name,
    value,
    required,
    onChange,
    disabled,
}: BaseFieldProps) {
    const { controlId } = useFieldControl();
    // Whether the field holds an instant. A cleared input keeps the last
    // answer, so a value typed after clearing keeps the form it had.
    const zoned = useRef(typeof value === 'string' && hasZone(value));
    useEffect(() => {
        if (typeof value === 'string' && value !== '') zoned.current = hasZone(value);
    }, [value]);
    return (
        <Input
            id={controlId}
            type="datetime-local"
            name={name}
            value={datetimeInputValue(value)}
            required={required}
            disabled={disabled}
            onChange={(e) =>
                onChange(name, datetimeFromInput(e.target.value, zoned.current))
            }
        />
    );
}
