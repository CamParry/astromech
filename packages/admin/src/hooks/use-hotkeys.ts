/**
 * Document-wide keyboard shortcuts. A plain-key shortcut stays out of text
 * entry, and no shortcut reaches the page while a modal dialog covers it.
 */

import type React from 'react';
import { useEffect } from 'react';

type HotkeyHandler = (event: KeyboardEvent) => void;

type HotkeyOptions = {
    enabled?: boolean;
    preventDefault?: boolean;
    /**
     * Whether the hotkey also runs while a modal dialog is open. Off by
     * default, since a modal takes the keyboard from the page behind it; a
     * hotkey that belongs to a dialog turns it on.
     */
    enableInModal?: boolean;
};

type ParsedHotkey = {
    key: string;
    meta: boolean;
    ctrl: boolean;
    shift: boolean;
    alt: boolean;
};

const isMac = typeof navigator !== 'undefined' && navigator.platform.includes('Mac');

function parseHotkey(descriptor: string): ParsedHotkey {
    const parts = descriptor.toLowerCase().split('+');
    const key = parts[parts.length - 1] ?? '';

    return {
        key,
        meta: parts.includes('meta') || parts.includes('cmd'),
        ctrl: parts.includes('ctrl') || (parts.includes('mod') && !isMac),
        shift: parts.includes('shift'),
        alt: parts.includes('alt'),
    };
}

function matchesHotkey(event: KeyboardEvent, parsed: ParsedHotkey): boolean {
    if (event.key.toLowerCase() !== parsed.key) return false;
    if (event.metaKey !== parsed.meta) return false;
    if (event.ctrlKey !== parsed.ctrl) return false;
    // A symbol such as `?` already says whether Shift was held to type it.
    if (!isSymbol(parsed.key) && event.shiftKey !== parsed.shift) return false;
    if (event.altKey !== parsed.alt) return false;

    return true;
}

/** A single printed character with no case, which Shift may be needed to type. */
function isSymbol(key: string): boolean {
    return key.length === 1 && key.toLowerCase() === key.toUpperCase();
}

function isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    if (target.isContentEditable) return true;
    return false;
}

/**
 * Base UI's modal backdrop: an unstyled `presentation` element that a modal
 * popup's portal renders beside it. The `Backdrop` part a page styles carries
 * `data-open` or `data-closed`, and a closing modal's backdrop is `inert`.
 */
const MODAL_BACKDROP =
    '[role="presentation"][data-base-ui-inert]:not([data-open]):not([data-closed]):not([inert])';

/** A dialog popup: Base UI's Dialog, AlertDialog and Popover parts set one of these roles. */
const DIALOG_POPUP = '[role="dialog"], [role="alertdialog"]';

/**
 * Whether a modal dialog is open. Base UI marks a modal popup with no
 * attribute of its own, and a popover is a `dialog` too, so the sign is the
 * modal backdrop in the popup's own portal.
 */
function isModalDialogOpen(): boolean {
    for (const popup of document.querySelectorAll(DIALOG_POPUP)) {
        const portal = popup.closest('[data-base-ui-portal]');
        if (portal === null) continue;
        for (const child of portal.children) {
            if (child.matches(MODAL_BACKDROP)) return true;
        }
    }
    return false;
}

/**
 * Run `handler` when one of `keys` is pressed anywhere in the document, as
 * `mod+s` (Cmd on a Mac, Ctrl elsewhere), `shift+n` or `?`. In an input, a
 * textarea or a contenteditable only a Cmd or Ctrl combination runs.
 */
export function useHotkeys(
    keys: string | string[],
    handler: HotkeyHandler,
    options?: HotkeyOptions,
    deps?: React.DependencyList
): void {
    const enabled = options?.enabled ?? true;
    const preventDefault = options?.preventDefault ?? true;
    const enableInModal = options?.enableInModal ?? false;

    useEffect(() => {
        if (!enabled) return;

        const descriptors = Array.isArray(keys) ? keys : [keys];
        const parsed = descriptors.map(parseHotkey);

        function onKeyDown(event: KeyboardEvent): void {
            const hotkey = parsed.find((candidate) => matchesHotkey(event, candidate));
            if (hotkey === undefined) return;
            if (!hotkey.meta && !hotkey.ctrl && isEditableTarget(event.target)) return;
            if (!enableInModal && isModalDialogOpen()) return;

            if (preventDefault) event.preventDefault();
            handler(event);
        }

        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [enabled, preventDefault, enableInModal, ...(deps ?? [])]);
}
