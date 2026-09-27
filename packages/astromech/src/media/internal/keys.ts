/**
 * The storage key of an original: `<id>.<ext>`, or the bare id when the filename
 * has no extension. Derived from the row alone, never from a URL.
 */
export function originalKey(id: string, filename: string): string {
    const ext = extOf(filename);
    return ext ? `${id}.${ext}` : id;
}

/** The file extension, without the dot, or '' when the filename has none. */
export function extOf(filename: string): string {
    const i = filename.lastIndexOf('.');
    return i >= 0 ? filename.slice(i + 1) : '';
}
