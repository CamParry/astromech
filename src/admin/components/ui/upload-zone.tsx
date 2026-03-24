import React, { useRef, useState, useCallback } from 'react';
import { UploadCloud } from 'lucide-react';
import { MEDIA_ACCEPT } from '@/admin/types/media.js';

type UploadZoneProps = {
    onUpload: (files: File[]) => void;
    accept?: string;
    multiple?: boolean;
    label?: string;
    disabled?: boolean;
    className?: string;
};

export function UploadZone({
    onUpload,
    accept = MEDIA_ACCEPT,
    multiple = true,
    label = 'Drop files here or click to upload',
    disabled = false,
    className,
}: UploadZoneProps): React.ReactElement {
    const inputRef = useRef<HTMLInputElement>(null);
    const [isDragging, setIsDragging] = useState(false);

    const handleFiles = useCallback(
        (files: FileList | null) => {
            if (!files || files.length === 0) return;
            onUpload(Array.from(files));
        },
        [onUpload]
    );

    return (
        <div
            className={['am-upload-zone', isDragging && 'am-upload-zone--dragging', disabled && 'am-upload-zone--disabled', className].filter(Boolean).join(' ')}
            onDragEnter={(e) => { e.preventDefault(); if (!disabled) setIsDragging(true); }}
            onDragOver={(e) => { e.preventDefault(); }}
            onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
            onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                if (!disabled) handleFiles(e.dataTransfer.files);
            }}
            onClick={() => { if (!disabled) inputRef.current?.click(); }}
            role="button"
            tabIndex={disabled ? -1 : 0}
            onKeyDown={(e) => { if (!disabled && (e.key === 'Enter' || e.key === ' ')) inputRef.current?.click(); }}
            aria-label={label}
        >
            <input
                ref={inputRef}
                type="file"
                accept={accept}
                multiple={multiple}
                className="am-upload-zone__input"
                onChange={(e) => handleFiles(e.target.files)}
                disabled={disabled}
            />
            <UploadCloud size={24} className="am-upload-zone__icon" />
            <span className="am-upload-zone__label">{label}</span>
        </div>
    );
}
