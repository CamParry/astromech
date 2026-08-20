/**
 * Shared router-link cast: surface link bases are runtime strings, so the
 * shared entry components address `Link` by string `to` rather than the
 * typed route union. One definition shared by the list page and the cells.
 */
import type * as React from 'react';
import { Link as RouterLink } from '@tanstack/react-router';

export type LinkProps = Omit<React.ComponentProps<typeof RouterLink>, 'to' | 'search'> & {
    to: string;
    search?: Record<string, unknown>;
};

export const Link = RouterLink as unknown as (props: LinkProps) => React.ReactElement;
