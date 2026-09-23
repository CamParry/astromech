/**
 * The router `Link`, addressed by a string `to`: admin link bases are runtime
 * strings, not the typed route union. Every admin component that links by a
 * built path imports this one.
 */
import type * as React from 'react';
import { Link as RouterLink } from '@tanstack/react-router';

export type LinkProps = Omit<React.ComponentProps<typeof RouterLink>, 'to' | 'search'> & {
    to: string;
    search?: Record<string, unknown>;
};

export const Link = RouterLink as unknown as (props: LinkProps) => React.ReactElement;
