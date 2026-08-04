/**
 * `astromech/methods` — the boot-generated method manifest and the dispatch,
 * filter, annotation, scoping and confirmation seams that operate on it.
 * Manifest types (`MethodManifest`, `ManifestMethod`) ship from `astromech`.
 */

export { getMethodManifest } from '@/codegen/manifest-registry.js';

export { formatAIContextMessage } from '@/utilities/ai-context.js';
export type { AIContextItem } from '@/types/ai-context.js';

export { buildDispatch, buildScopedDispatch } from '@/transport/tools/dispatch.js';
export type { DispatchResult, ToolDefinition } from '@/transport/tools/dispatch.js';
export { buildScopedTools } from '@/transport/tools/scoped-tools.js';

export { filterMethods } from '@/policies/method-filter.js';
export { annotateManifest } from '@/policies/annotate-manifest.js';

export { scopedServices } from '@/policies/scoped-services.js';
export type { ScopedServices } from '@/policies/scoped-services.js';

export {
    CONFIRM_KEY,
    evaluateConfirmation,
    triggersConfirmation,
} from '@/policies/confirmation.js';
export type {
    ConfirmDecision,
    ConfirmOptions,
    ConfirmOutcome,
    ConfirmRequest,
} from '@/policies/confirmation.js';
