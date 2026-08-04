/** Map an entry status to its Badge variant. Shared by badge-cell and the grid EntryCard. */
export function statusVariant(
    status: string
): 'unpublished' | 'published' | 'scheduled' | 'default' {
    if (status === 'unpublished') return 'unpublished';
    if (status === 'published') return 'published';
    if (status === 'scheduled') return 'scheduled';
    return 'default';
}
