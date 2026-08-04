/** `content` domain module — model-driven translate / transform / generate. */
export { contentService, translate, transform, generate } from './service.js';
export { contentDescriptors } from './methods.js';
export {
    setContentProvider,
    getContentProvider,
    type ContentProvider,
    type ContentRewriteRequest,
} from './provider.js';
export { ContentOperationError, ContentProviderContractError } from './errors.js';
