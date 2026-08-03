import type { BaseFieldProps } from '@/types/index.js';
import { Input } from '@/admin/components/ui/input';
import { useFieldControl } from './field-control-context';
import './link-field.css';

/** The three keys this control edits. A link value may carry others. */
type LinkValue = {
    url: string;
    label: string;
    target: '_self' | '_blank';
};

/** Read the edited keys off a stored value, tolerating a missing or odd one. */
function toLinkValue(v: unknown): LinkValue {
    const obj = toObject(v);
    return {
        url: typeof obj['url'] === 'string' ? obj['url'] : '',
        label: typeof obj['label'] === 'string' ? obj['label'] : '',
        target: obj['target'] === '_blank' ? '_blank' : '_self',
    };
}

/** The stored object itself, so keys this control does not edit survive a change. */
function toObject(v: unknown): Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v)
        ? (v as Record<string, unknown>)
        : {};
}

export function LinkField({ name, value, onChange, disabled }: BaseFieldProps) {
    const link = toLinkValue(value);
    // The two `Input`s pick the error association up from the context themselves;
    // this bare `select` is the one control that has to apply it by hand.
    const { ariaProps } = useFieldControl();

    function handleChange(key: keyof LinkValue, val: string) {
        onChange(name, { ...toObject(value), ...link, [key]: val });
    }

    return (
        <div className="am-link-field">
            <div className="am-link-field-row">
                <label className="am-link-field-label" htmlFor={`${name}--url`}>
                    URL
                </label>
                <Input
                    id={`${name}--url`}
                    type="url"
                    name={`${name}[url]`}
                    value={link.url}
                    placeholder="https://"
                    disabled={disabled}
                    onChange={(e) => handleChange('url', e.target.value)}
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
