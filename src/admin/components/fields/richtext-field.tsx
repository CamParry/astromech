import { useRef, useState } from 'react';
import type { BaseFieldProps } from '@/types/index.js';
import { formatValueForInput } from '@/utils/field-formatters';
import { RichTextEditor } from '@/admin/components/ui/rich-text-editor.js';

export function RichtextField({ name, value, required, onChange, disabled }: BaseFieldProps) {
    const stringValue = formatValueForInput(value, 'richtext');
    const [content, setContent] = useState(stringValue);
    const inputRef = useRef<HTMLInputElement>(null);

    function handleChange(html: string) {
        setContent(html);
        if (inputRef.current) inputRef.current.value = html;
        onChange(name, html);
    }

    return (
        <>
            <RichTextEditor value={stringValue} onChange={handleChange} disabled={disabled} />
            <input
                ref={inputRef}
                type="hidden"
                name={name}
                value={content}
                onChange={() => {}}
                required={required}
            />
        </>
    );
}
