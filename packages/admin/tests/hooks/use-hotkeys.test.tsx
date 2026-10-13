/**
 * @vitest-environment happy-dom
 *
 * `mod` is Cmd on a Mac and Ctrl elsewhere: the save shortcut runs on that
 * combination alone, and its label and `aria-keyshortcuts` name it the way
 * the platform does.
 */

import { renderHook } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    ariaKeyShortcuts,
    hotkeyLabel,
    SAVE_HOTKEY,
    useHotkeys,
} from '@/admin/hooks/use-hotkeys';

/** Report `platform` as the browser's, for the rest of the test. */
function onPlatform(platform: string): void {
    vi.spyOn(
        Object.getPrototypeOf(navigator) as Navigator,
        'platform',
        'get'
    ).mockReturnValue(platform);
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('the save shortcut on a Mac', () => {
    it('runs on Cmd+S, and not on Ctrl+S or a bare S', async () => {
        onPlatform('MacIntel');
        const onSave = vi.fn();
        renderHook(() => useHotkeys(SAVE_HOTKEY, onSave));
        const user = userEvent.setup();

        await user.keyboard('s');
        await user.keyboard('{Control>}s{/Control}');
        expect(onSave).not.toHaveBeenCalled();

        await user.keyboard('{Meta>}s{/Meta}');
        expect(onSave).toHaveBeenCalledOnce();
    });

    it('is named ⌘S and Meta+S', () => {
        onPlatform('MacIntel');

        expect(hotkeyLabel(SAVE_HOTKEY)).toBe('⌘S');
        expect(ariaKeyShortcuts(SAVE_HOTKEY)).toBe('Meta+S');
    });
});

describe('the save shortcut elsewhere', () => {
    it('runs on Ctrl+S, and not on Cmd+S or a bare S', async () => {
        onPlatform('Win32');
        const onSave = vi.fn();
        renderHook(() => useHotkeys(SAVE_HOTKEY, onSave));
        const user = userEvent.setup();

        await user.keyboard('s');
        await user.keyboard('{Meta>}s{/Meta}');
        expect(onSave).not.toHaveBeenCalled();

        await user.keyboard('{Control>}s{/Control}');
        expect(onSave).toHaveBeenCalledOnce();
    });

    it('is named Ctrl+S and Control+S', () => {
        onPlatform('Linux x86_64');

        expect(hotkeyLabel(SAVE_HOTKEY)).toBe('Ctrl+S');
        expect(ariaKeyShortcuts(SAVE_HOTKEY)).toBe('Control+S');
    });
});
