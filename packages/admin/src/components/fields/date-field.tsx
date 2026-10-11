import type { BaseFieldProps } from 'astromech';
import { dateInputValue } from '../../utilities/formatters';
import { Input } from '../ui/input';
import { useFieldControl } from './field-control-context';

export function DateField({ name, value, required, onChange, disabled }: BaseFieldProps) {
    const { controlId } = useFieldControl();
    return (
        <Input
            id={controlId}
            type="date"
            name={name}
            value={dateInputValue(value)}
            required={required}
            disabled={disabled}
            onChange={(e) => onChange(name, e.target.value)}
        />
    );
}
