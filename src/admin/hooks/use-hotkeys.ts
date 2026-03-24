import { useEffect } from 'react';
import type React from 'react';

type HotkeyHandler = (event: KeyboardEvent) => void;

type HotkeyOptions = {
    enabled?: boolean;
    preventDefault?: boolean;
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
    const eventKey = event.key.toLowerCase();

    // Normalize key names
    const normalizedKey = parsed.key === 'escape' ? 'escape'
        : parsed.key === 'enter' ? 'enter'
        : parsed.key === 'tab' ? 'tab'
        : parsed.key;

    if (eventKey !== normalizedKey) return false;
    if (event.metaKey !== parsed.meta) return false;
    if (event.ctrlKey !== parsed.ctrl) return false;
    if (event.shiftKey !== parsed.shift) return false;
    if (event.altKey !== parsed.alt) return false;

    return true;
}

function isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    if (target.isContentEditable) return true;
    return false;
}

export function useHotkeys(
    keys: string | string[],
    handler: HotkeyHandler,
    options?: HotkeyOptions,
    deps?: React.DependencyList,
): void {
    const enabled = options?.enabled ?? true;
    const preventDefault = options?.preventDefault ?? true;

    useEffect(() => {
        if (!enabled) return;

        const descriptors = Array.isArray(keys) ? keys : [keys];
        const parsed = descriptors.map(parseHotkey);

        function onKeyDown(event: KeyboardEvent): void {
            if (isEditableTarget(event.target)) return;

            for (const hotkey of parsed) {
                if (matchesHotkey(event, hotkey)) {
                    if (preventDefault) {
                        event.preventDefault();
                    }
                    handler(event);
                    return;
                }
            }
        }

        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('keydown', onKeyDown);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, preventDefault, ...(deps ?? [])]);
}
