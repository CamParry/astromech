/** `content` domain module — model-driven translate / transform / generate. */
export {
    contentApi,
    translate,
    transform,
    generate,
    type ContentFieldSummary,
    type ContentOperationResult,
    type ContentTarget,
} from './service.js';
export {
    setContentProvider,
    getContentProvider,
    type ContentProvider,
    type ContentRewriteRequest,
} from './provider.js';
export { ContentOperationError, ContentProviderContractError } from './errors.js';
