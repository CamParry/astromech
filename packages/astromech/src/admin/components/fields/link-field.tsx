import type { BaseFieldProps } from '@/types/index.js';
import { Input } from '@/admin/components/ui/input';
import { useFieldControl } from './field-control-context';
import './link-field.css';

type LinkValue = {
    href: string;
    label: string;
    target: '_self' | '_blank';
};

function toLinkValue(v: unknown): LinkValue {
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
        const obj = v as Record<string, unknown>;
        return {
            href: typeof obj['href'] === 'string' ? obj['href'] : '',
            label: typeof obj['label'] === 'string' ? obj['label'] : '',
            target: obj['target'] === '_blank' ? '_blank' : '_self',
        };
    }
    return { href: '', label: '', target: '_self' };
}

export function LinkField({ name, value, onChange, disabled }: BaseFieldProps) {
    const link = toLinkValue(value);
    // The two `Input`s pick the error association up from the context themselves;
    // this bare `select` is the one control that has to apply it by hand.
    const { ariaProps } = useFieldControl();

    function handleChange(key: keyof LinkValue, val: string) {
        onChange(name, { ...link, [key]: val });
    }

    return (
        <div className="am-link-field">
            <div className="am-link-field-row">
                <label className="am-link-field-label" htmlFor={`${name}--href`}>
                    URL
                </label>
                <Input
                    id={`${name}--href`}
                    type="url"
                    name={`${name}[href]`}
                    value={link.href}
                    placeholder="https://"
                    disabled={disabled}
                    onChange={(e) => handleChange('href', e.target.value)}
                />
            </div>
            <div className="am-link-field-row">
                <label className="am-link-field-label" htmlFor={`${name}--label`}>
                    Label
                </label>
                <Input
                    id={`${name}--label`}
                    type="text"
                    name={`${name}[label]`}
                    value={link.label}
                    placeholder="Link text"
                    disabled={disabled}
                    onChange={(e) => handleChange('label', e.target.value)}
                />
            </div>
            <div className="am-link-field-row">
                <label className="am-link-field-label" htmlFor={`${name}--target`}>
                    Target
                </label>
                <select
                    id={`${name}--target`}
                    name={`${name}[target]`}
                    value={link.target}
                    disabled={disabled}
                    onChange={(e) => handleChange('target', e.target.value)}
                    className="am-input am-link-field-select"
                    {...ariaProps}
                >
                    <option value="_self">Same tab</option>
                    <option value="_blank">New tab</option>
                </select>
            </div>
        </div>
    );
}
