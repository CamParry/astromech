/**
 * `astromech/ui/app` — the parts of the admin UI that need the running admin.
 * Each one reaches `virtual:astromech/admin-config`, the fetch client or an
 * admin React context, so none of them load outside a booted admin.
 */

import { assertSingleUiInstance } from '@/admin/components/ui/instance-guard';

assertSingleUiInstance();

// Plugin runtime context hook (spec §8) — only usable inside plugin surfaces.
export { useAstromechPlugin } from '@/admin/context/plugin';

export {
    CommandPaletteProvider,
    CommandPalette,
    useCommandPalette,
} from './command-palette';

// AI context: declare what a surface is showing, or read what every surface declared.
export { useAiContext, useAiContextItems } from '@/admin/context/ai-context';
export type { AiContextItem } from '@/types/ai-context';

export { ApiErrorPanel, dispatchApiErrorEvent } from './api-error-panel';
export type { ApiErrorEventDetail } from './api-error-panel';
