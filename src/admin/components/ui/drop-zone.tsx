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
        if (!disabled) {
            const files = Array.from(e.dataTransfer.files);
            if (files.length > 0) onUpload(files);
        }
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
