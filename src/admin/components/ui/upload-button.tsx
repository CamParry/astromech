import React, { useRef } from 'react';
import { Upload } from 'lucide-react';
import { Button } from './button.js';
import type { ButtonProps } from './button.js';
import { MEDIA_ACCEPT } from '@/admin/types/media.js';

export type UploadButtonProps = {
    /** Called with the selected File objects when the user picks files. */
    onUpload: (files: File[]) => void;
    /** Accepted MIME types / extensions forwarded to the file input. Defaults to common media types. */
    accept?: string;
    /** Allow selecting multiple files. @default false */
    multiple?: boolean;
    disabled?: boolean;
    loading?: boolean;
    variant?: ButtonProps['variant'];
    size?: ButtonProps['size'];
    children?: React.ReactNode;
};

export function UploadButton({
    onUpload,
    accept = MEDIA_ACCEPT,
    multiple = false,
    disabled,
    loading,
    variant = 'primary',
    size,
    children,
}: UploadButtonProps): React.ReactElement {
    const inputRef = useRef<HTMLInputElement>(null);

    function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
        const files = Array.from(e.target.files ?? []);
        if (files.length > 0) onUpload(files);
        // Reset so the same file can be re-selected
        e.target.value = '';
    }

    return (
        <>
            <input
                ref={inputRef}
                type="file"
                accept={accept}
                multiple={multiple}
                style={{ display: 'none' }}
                onChange={handleChange}
                disabled={disabled}
                tabIndex={-1}
                aria-hidden="true"
            />
            <Button
                variant={variant}
                size={size}
                disabled={disabled}
                loading={loading}
                onClick={() => inputRef.current?.click()}
            >
                {children ?? (
                    <>
                        <Upload size={14} className="am-upload-btn__icon" />
                        Upload
                    </>
                )}
            </Button>
        </>
    );
}
