/** `settings` domain module — global key/value settings with public/private visibility. */
export { settingsApi } from './service.js';
export { settingsDescriptors } from './descriptors.js';
export { setSettingSchema } from './schema.js';
export { isPublicSettingKey } from './visibility.js';
export {
    partitionGlobalValues,
    mergeGlobalValues,
    mergeLocaleSetting,
    type PartitionedGlobalValues,
} from './page-values.js';
