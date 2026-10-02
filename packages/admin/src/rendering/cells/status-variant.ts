/** Map a badge column's value to a Badge variant, coloured like a status when it is one. */
export function statusVariant(
    status: string
): 'unpublished' | 'published' | 'scheduled' | 'default' {
    if (status === 'unpublished') return 'unpublished';
    if (status === 'published') return 'published';
    if (status === 'scheduled') return 'scheduled';
    return 'default';
}
