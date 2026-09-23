/**
 * `astromech/methods` — the boot-generated method manifest and the dispatch,
 * filter, annotation, scoping and confirmation seams that operate on it.
 * Manifest types (`MethodManifest`, `ManifestMethod`) ship from `astromech`.
 */

export { getMethodManifest } from '@/codegen/manifest-registry';

export { formatAiContextMessage } from '@/utilities/ai-context';
export type { AiContextItem } from '@/types/ai-context';

export { buildDispatch, buildScopedDispatch } from '@/transport/tools/dispatch';
export type { DispatchResult } from '@/transport/tools/dispatch';
export type { ToolDefinition } from '@/types/index';
export { buildScopedTools } from '@/transport/tools/scoped-tools';

export { filterMethods } from '@/policies/method-filter';
export { annotateManifest } from '@/policies/annotate-manifest';

export { createServices } from '@/app-context/services';
export type { CreateServicesOptions } from '@/app-context/services';

export {
    CONFIRM_KEY,
    evaluateConfirmation,
    triggersConfirmation,
} from '@/policies/confirmation';
export type {
    ConfirmDecision,
    ConfirmOptions,
    ConfirmationResult,
    ConfirmRequest,
} from '@/policies/confirmation';
