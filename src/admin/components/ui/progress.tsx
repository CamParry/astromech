/**
 * Progress bar built on Base UI Progress.
 */

import React from 'react';
import { Progress as BaseProgress } from '@base-ui/react/progress';

type ProgressProps = {
    value: number | null;
    label?: string;
    showValue?: boolean;
    min?: number;
    max?: number;
};

export function Progress({
    value,
    label,
    showValue = false,
    min = 0,
    max = 100,
}: ProgressProps): React.ReactElement {
    return (
        <BaseProgress.Root value={value} min={min} max={max} className="am-progress">
            {label !== undefined && (
                <BaseProgress.Label className="am-progress__label">{label}</BaseProgress.Label>
            )}
            <BaseProgress.Track className="am-progress__track">
                <BaseProgress.Indicator className="am-progress__indicator" />
            </BaseProgress.Track>
            {showValue && (
                <BaseProgress.Value className="am-progress__value" />
            )}
        </BaseProgress.Root>
    );
}

export type { ProgressProps };
