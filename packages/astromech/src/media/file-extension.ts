/**
 * The file extension of a media filename, shared by core and the admin through
 * `astromech/shared`.
 */

/**
 * The file extension in lower case, without the dot, or '' when the filename has
 * none. Lower case because `a.JPG` and `b.jpg` are one file on a case-insensitive disk.
 */
export function fileExtension(filename: string): string {
    const i = filename.lastIndexOf('.');
    return i >= 0 ? filename.slice(i + 1).toLowerCase() : '';
}
