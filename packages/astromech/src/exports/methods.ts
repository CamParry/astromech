/**
 * `astromech/methods` — the boot-generated method manifest and the dispatch,
 * surface, annotation, scoping and confirmation seams that operate on it.
 * Manifest types (`MethodManifest`, `ManifestMethod`) ship from `astromech`.
 */

export { getMethodManifest } from '@/codegen/manifest-registry.js';

export { formatAIContextMessage } from '@/utilities/ai-context.js';
export type { AIContextEntry } from '@/utilities/ai-context.js';

export { buildDispatch } from '@/transport/mcp/dispatch.js';
export type { DispatchResult, ToolDispatch } from '@/transport/mcp/dispatch.js';

export { reduceSurface } from '@/policies/tool-surface.js';
export { annotateManifest } from '@/policies/annotate-manifest.js';

export { scopedService } from '@/policies/scoped-service.js';
export type { ScopedService } from '@/policies/scoped-service.js';

export {
    CONFIRM_KEY,
    evaluateConfirmation,
    triggersConfirmation,
} from '@/policies/confirm-gate.js';
export type {
    ConfirmDecision,
    ConfirmOptions,
    ConfirmRequest,
    GateOutcome,
} from '@/policies/confirm-gate.js';
