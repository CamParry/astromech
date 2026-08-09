/**
 * Storage keys for media originals. Derived from the record (id + filename),
 * never from a URL, so a key is reproducible from the row alone.
 */

/** Storage key for an original: `<id>.<ext>`, or the bare id when there is none. */
export function originalKey(id: string, filename: string): string {
    const ext = extOf(filename);
    return ext ? `${id}.${ext}` : id;
}

/** File extension (without the dot), or '' when the filename has none. */
export function extOf(filename: string): string {
    const i = filename.lastIndexOf('.');
    return i >= 0 ? filename.slice(i + 1) : '';
}
