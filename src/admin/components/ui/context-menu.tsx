import React, { useCallback, useRef, useState } from 'react';
import { Menu } from '@base-ui/react/menu';
import type { DropdownItem } from './dropdown.js';

// ============================================================================
// Types
// ============================================================================

type ContextMenuProps = {
    items: DropdownItem[];
    children: React.ReactNode;
};

type CursorPosition = {
    x: number;
    y: number;
};

type UseContextMenuReturn = {
    onContextMenu: (e: React.MouseEvent) => void;
    contextMenuNode: React.ReactNode;
};

// ============================================================================
// Helpers
// ============================================================================

function buildVirtualAnchor(pos: CursorPosition): {
    getBoundingClientRect: () => DOMRect;
} {
    return {
        getBoundingClientRect: () =>
            new DOMRect(pos.x, pos.y, 0, 0),
    };
}

// ============================================================================
// Hook — for use with Table.Row and other DOM elements
// ============================================================================

export function useContextMenu(items: DropdownItem[]): UseContextMenuReturn {
    const [open, setOpen] = useState(false);
    const [position, setPosition] = useState<CursorPosition>({ x: 0, y: 0 });
    const anchorRef = useRef(buildVirtualAnchor({ x: 0, y: 0 }));

    const onContextMenu = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        const pos = { x: e.clientX, y: e.clientY };
        setPosition(pos);
        anchorRef.current = buildVirtualAnchor(pos);
        setOpen(true);
    }, []);

    const contextMenuNode = (
        <Menu.Root open={open} onOpenChange={setOpen}>
            <Menu.Portal>
                <Menu.Positioner
                    className="am-dropdown-positioner"
                    anchor={anchorRef.current}
                    side="bottom"
                    align="start"
                    style={{ zIndex: 200 }}
                >
                    <Menu.Popup className="am-dropdown-popup">
                        {items.map((item, i) => {
                            const itemClass = [
                                'am-dropdown-item',
                                item.variant === 'danger' ? 'am-dropdown-item-danger' : '',
                            ]
                                .filter(Boolean)
                                .join(' ');

                            if (item.href !== undefined) {
                                return (
                                    <Menu.Item
                                        key={i}
                                        className={itemClass}
                                        disabled={item.disabled}
                                        render={<a href={item.href} />}
                                    >
                                        {item.icon !== undefined && (
                                            <span className="am-dropdown-item-icon">{item.icon}</span>
                                        )}
                                        {item.label}
                                    </Menu.Item>
                                );
                            }

                            return (
                                <Menu.Item
                                    key={i}
                                    className={itemClass}
                                    disabled={item.disabled}
                                    onClick={item.onClick}
                                >
                                    {item.icon !== undefined && (
                                        <span className="am-dropdown-item-icon">{item.icon}</span>
                                    )}
                                    {item.label}
                                </Menu.Item>
                            );
                        })}
                    </Menu.Popup>
                </Menu.Positioner>
            </Menu.Portal>
        </Menu.Root>
    );

    // Suppress unused-variable warning: position is consumed via anchorRef
    void position;

    return { onContextMenu, contextMenuNode };
}

// ============================================================================
// Component — for non-table use (e.g. grid cards)
// ============================================================================

export function ContextMenu({ items, children }: ContextMenuProps): React.ReactElement {
    const { onContextMenu, contextMenuNode } = useContextMenu(items);

    return (
        <>
            <div style={{ display: 'contents' }} onContextMenu={onContextMenu}>
                {children}
            </div>
            {contextMenuNode}
        </>
    );
}

export type { ContextMenuProps };
