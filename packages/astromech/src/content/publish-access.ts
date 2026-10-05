/**
 * Whether a write's payload needs `publish` beside the write's own permission:
 * any `status` or `publishedAt` on an update, and on a create any but the
 * defaults (`unpublished`, no date). Decided from the payload alone (`DECISIONS.md`).
 */
export function needsPublish(payload: unknown, write: 'create' | 'update'): boolean {
    if (typeof payload !== 'object' || payload === null) return false;
    const { status, publishedAt } = payload as {
        status?: unknown;
        publishedAt?: unknown;
    };
    if (write === 'create') {
        return (
            (status !== undefined && status !== 'unpublished') ||
            (publishedAt !== undefined && publishedAt !== null)
        );
    }
    return status !== undefined || publishedAt !== undefined;
}
