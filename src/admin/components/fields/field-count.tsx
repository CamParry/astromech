import { clsx } from 'clsx';
import type { FieldDefinition } from '@/types/index.js';
import { lengthStatus } from '@/utils/field-count.js';

type CountSetting = NonNullable<FieldDefinition['count']>;

/**
 * Advisory character counter rendered beneath `text`/`textarea` controls when
 * `field.count` is set. With a range it colours under/good/over; otherwise it
 * shows the raw length.
 */
export function FieldCount({
    value,
    count,
}: {
    value: string;
    count: CountSetting;
}) {
    const length = value.length;
    const range = typeof count === 'object' ? count : undefined;
    const status = range ? lengthStatus(length, range) : undefined;

    return (
        <span
            className={clsx('am-field-count', status && `am-field-count--${status}`)}
            aria-hidden="true"
        >
            {range?.max !== undefined ? `${length} / ${range.max}` : length}
        </span>
    );
}
