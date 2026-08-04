/** `settings` domain module — global key/value settings with public/private visibility. */
export { settingsService } from './service.js';
export { settingsDescriptors } from './methods.js';
export { setSettingSchema } from './schema.js';
export { isPublicSettingKey } from './visibility.js';
export {
    partitionGlobalValues,
    mergeGlobalValues,
    mergeLocaleSetting,
    type PartitionedGlobalValues,
} from './page-values.js';
