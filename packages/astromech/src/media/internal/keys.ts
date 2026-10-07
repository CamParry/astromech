import { fileExtension } from '../file-extension';

/**
 * The storage key of an original: `<id>.<ext>`, or the bare id when the filename
 * has no extension. Derived from the row alone, never from a URL.
 */
export function originalKey(id: string, filename: string): string {
    const ext = fileExtension(filename);
    return ext ? `${id}.${ext}` : id;
}
