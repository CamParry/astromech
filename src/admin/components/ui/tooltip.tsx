import React from 'react';
import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip';

type TooltipProps = {
    content: string;
    children: React.ReactElement;
    side?: 'top' | 'bottom' | 'left' | 'right';
};

export function Tooltip({ content, children, side = 'top' }: TooltipProps): React.ReactElement {
    return (
        <BaseTooltip.Provider>
            <BaseTooltip.Root>
                <BaseTooltip.Trigger render={children} />
                <BaseTooltip.Portal>
                    <BaseTooltip.Positioner side={side}>
                        <BaseTooltip.Popup className="am-tooltip-popup">
                            {content}
                            <BaseTooltip.Arrow className="am-tooltip-arrow" />
                        </BaseTooltip.Popup>
                    </BaseTooltip.Positioner>
                </BaseTooltip.Portal>
            </BaseTooltip.Root>
        </BaseTooltip.Provider>
    );
}

export type { TooltipProps };
