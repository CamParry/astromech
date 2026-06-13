/** Map an entry status to its Badge variant. Shared by badge-cell and the grid EntryCard. */
export function statusVariant(
    status: string
): 'draft' | 'published' | 'scheduled' | 'default' {
    if (status === 'draft') return 'draft';
    if (status === 'published') return 'published';
    if (status === 'scheduled') return 'scheduled';
    return 'default';
}
