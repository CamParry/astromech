/** `settings` domain module — global key/value settings with public/private visibility. */
export { settingsService } from './service';
export { settingsContract } from './methods';
export { setSettingSchema } from './schema';
export { isPublicSettingKey } from './visibility';
export {
    partitionGlobalValues,
    mergeGlobalValues,
    mergeLocaleSetting,
    type PartitionedGlobalValues,
} from './page-values.shared';
