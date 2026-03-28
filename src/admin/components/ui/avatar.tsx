/**
 * Avatar component built on Base UI Avatar primitives.
 */

import React from 'react';
import { Avatar as BaseAvatar } from '@base-ui/react/avatar';

type AvatarProps = {
    name: string;
    src?: string | null;
    size?: 'sm' | 'md' | 'lg';
};

function getInitials(name: string): string {
    return name
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0]!.toUpperCase())
        .join('');
}

export function Avatar({ name, src, size = 'md' }: AvatarProps): React.ReactElement {
    return (
        <BaseAvatar.Root className={`am-avatar am-avatar-${size}`} aria-label={name}>
            {src != null && (
                <BaseAvatar.Image src={src} alt={name} className="am-avatar-image" />
            )}
            <BaseAvatar.Fallback className="am-avatar-fallback">
                {getInitials(name)}
            </BaseAvatar.Fallback>
        </BaseAvatar.Root>
    );
}

export type { AvatarProps };
