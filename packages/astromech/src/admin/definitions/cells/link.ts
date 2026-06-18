/**
 * Shared router-link cast.
 *
 * Surface link bases are runtime strings (`/entries/post`,
 * `/plugin/redirects/entries/redirect`), so the shared entry components address
 * them by string `to` rather than the typed route union. The cast preserves the
 * rest of `Link`'s props (className, search, onClick, children). One canonical
 * definition shared by the list page and the cells that emit links
 * (title-cell, translations-cell).
 */
import { Link as RouterLink } from '@tanstack/react-router';
import type * as React from 'react';

export type LinkProps = Omit<React.ComponentProps<typeof RouterLink>, 'to' | 'search'> & {
    to: string;
    search?: Record<string, unknown>;
};

export const Link = RouterLink as unknown as (props: LinkProps) => React.ReactElement;
