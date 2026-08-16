/**
 * The config pipeline: load an author's config file, resolve it, and hold the
 * result for readers.
 */

export { loadConfigFile, resolveConfigPath } from '@/config/load';
export { resolveConfig } from '@/config/resolve';
export { buildAdminConfig } from '@/config/admin-config';
export { getConfig, setConfig } from '@/config/registry';
