import React, { useState } from 'react';
import { UploadCloud } from 'lucide-react';

export type DropZoneProps = {
    onUpload: (files: File[]) => void;
    accept?: string;
    multiple?: boolean;
    disabled?: boolean;
    overlayLabel?: string;
    children: React.ReactNode;
};

export function DropZone({
    onUpload,
    accept,
    multiple = false,
    disabled,
    overlayLabel = 'Drop files to upload',
    children,
}: DropZoneProps): React.ReactElement {
    const [isDragging, setIsDragging] = useState(false);

    function handleDragEnter(e: React.DragEvent) {
        e.preventDefault();
        if (!disabled) setIsDragging(true);
    }

    function handleDragOver(e: React.DragEvent) {
        e.preventDefault();
    }

    function handleDragLeave(e: React.DragEvent) {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setIsDragging(false);
        }
    }

    function handleDrop(e: React.DragEvent) {
        e.preventDefault();
        setIsDragging(false);
        if (disabled) return;
        const files = selectDroppedFiles(
            Array.from(e.dataTransfer.files),
            accept,
            multiple
        );
        if (files.length > 0) onUpload(files);
    }

    return (
        <div
            className="am-drop-zone"
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            {isDragging && (
                <div className="am-drop-zone-overlay">
                    <div className="am-drop-zone-overlay-content">
                        <UploadCloud size={32} />
                        <span>{overlayLabel}</span>
                    </div>
                </div>
            )}
            {children}
        </div>
    );
}

/** Narrow a drop to the files the zone actually takes: `accept` filter, then the `multiple` cap. */
export function selectDroppedFiles(
    files: File[],
    accept: string | undefined,
    multiple: boolean
): File[] {
    const matching = files.filter((f) => matchesAccept(f, accept));
    return multiple ? matching : matching.slice(0, 1);
}

/** Match a dropped file against an `accept` list (`image/*,.pdf`). No list accepts everything. */
function matchesAccept(file: File, accept: string | undefined): boolean {
    if (accept === undefined || accept.trim() === '') return true;
    const name = file.name.toLowerCase();
    const type = file.type.toLowerCase();
    return accept
        .split(',')
        .map((token) => token.trim().toLowerCase())
        .filter((token) => token !== '')
        .some((token) => {
            if (token.startsWith('.')) return name.endsWith(token);
            if (token.endsWith('/*')) return type.startsWith(token.slice(0, -1));
            return type === token;
        });
}
