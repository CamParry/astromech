/**
 * The list/grid toggle the entries list and the media library share.
 */

import type { ViewMode } from '../../types/media';
import { LayoutGrid, LayoutList } from 'lucide-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { ToggleGroup } from '../ui/toggle-group';

export function ViewModeToggle({
    value,
    onChange,
}: {
    value: ViewMode;
    onChange: (value: ViewMode) => void;
}): React.ReactElement {
    const { t } = useTranslation();
    return (
        <ToggleGroup
            value={value}
            onValueChange={onChange}
            items={[
                {
                    value: 'grid',
                    icon: <LayoutGrid size={15} />,
                    label: t('common.gridView'),
                },
                {
                    value: 'list',
                    icon: <LayoutList size={15} />,
                    label: t('common.listView'),
                },
            ]}
        />
    );
}
