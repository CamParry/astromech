import type { ButtonProps } from './button';
import React from 'react';
import { ariaKeyShortcuts, hotkeyLabel, SAVE_HOTKEY } from '../../hooks/use-hotkeys';
import { Button } from './button';
import { Tooltip } from './tooltip';

/**
 * The primary Save of an edit screen or the media modal. It names the save
 * shortcut (Cmd+S on a Mac, Ctrl+S elsewhere) in a tooltip and in
 * `aria-keyshortcuts`. The form behind it registers the shortcut itself:
 * `useFieldsForm` does, or a form calls `useHotkeys(SAVE_HOTKEY, …)`.
 */
export function SaveButton(props: ButtonProps): React.ReactElement {
    return (
        <Tooltip content={hotkeyLabel(SAVE_HOTKEY)}>
            <Button aria-keyshortcuts={ariaKeyShortcuts(SAVE_HOTKEY)} {...props} />
        </Tooltip>
    );
}
